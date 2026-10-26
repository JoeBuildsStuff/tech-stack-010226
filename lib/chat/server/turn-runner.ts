import "server-only";
import { z } from "zod";
import { isClientTool, toolDefinitions } from "@/lib/chat/tools/definitions";
import {
  toTypedToolCall,
  type ChatMessagePart,
  type ChatSettings,
  type ChatToolCall,
  type ChatTurnRequest,
  type Citation,
  type PageContext,
  type TurnEvent,
} from "@/lib/chat/contracts";
import { applyCitations, applyTurnEvent, joinTextParts } from "@/lib/chat/parts";
import type { PersistedChatMessage } from "@/lib/chat/conversation-types";
import {
  completeTurn,
  failTurn,
  saveTurnProgress,
  type ChatAuth,
  type TurnRef,
} from "./conversation-service";
import { buildCanonicalHistory } from "./history";
import { providerFor } from "./providers";
import { buildSystemPrompt } from "./system-prompt";
import { enabledToolSpecs, executeTool } from "./tools";
import {
  finishLiveTurn,
  publish,
  registerLiveTurn,
  type LiveTurn,
} from "./turn-bus";

/** Model calls per turn; the last one must answer instead of calling tools. */
const MAX_ROUNDS = 8;
const CHECKPOINT_MS = 750;
/** Under expire_stale_chat_turns' 90s threshold, with room for slow writes. */
const HEARTBEAT_MS = 20_000;

export interface RunTurnInput {
  auth: ChatAuth;
  turn: TurnRef;
  model: string;
  settings: ChatSettings;
  request: ChatTurnRequest;
  context: PageContext | null;
  /** Completed messages on the path, ending with this turn's user message. */
  path: PersistedChatMessage[];
  /** Parts already in the reply when resuming after the user answered. */
  initialParts?: ChatMessagePart[];
  initialCitations?: Citation[];
}

class TurnStopped extends Error {}

/**
 * Generate one assistant reply on the server, independent of any browser
 * request. Parts are checkpointed to the database as they stream, so closing
 * the tab neither loses the reply nor stops it.
 */
export function startTurn(input: RunTurnInput): LiveTurn | null {
  const live = registerLiveTurn({
    turnId: input.turn.turnId,
    userId: input.auth.userId,
    sessionId: input.turn.sessionId,
    assistantMessageId: input.turn.assistantMessageId,
    parts: input.initialParts ?? [],
    citations: input.initialCitations ?? [],
  });
  if (!live) return null;
  void runTurn(input, live);
  return live;
}

/** Promise for `after()`, so the platform keeps the work alive. */
export function turnSettled(live: LiveTurn) {
  return new Promise<void>((resolve) => {
    if (live.status !== "streaming") return resolve();
    live.listeners.add((message) => {
      if (message.type === "status" && message.status !== "streaming") resolve();
    });
  });
}

async function runTurn(input: RunTurnInput, live: LiveTurn) {
  const { auth, turn } = input;
  const signal = live.controller.signal;
  let dirty = false;
  let saving: Promise<void> | null = null;
  let lastSave = 0;

  const checkpoint = async (status: "streaming" | "awaiting_input" = "streaming") => {
    dirty = false;
    lastSave = Date.now();
    const saved = await saveTurnProgress(auth, turn, live.parts, status);
    if (saved.error !== undefined) throw new Error(saved.error);
    // Stopped from another tab or instance, or superseded by a new branch.
    if (saved.data !== status) throw new TurnStopped(saved.data);
  };
  const scheduleCheckpoint = () => {
    dirty = true;
    if (saving || Date.now() - lastSave < CHECKPOINT_MS) return;
    saving = checkpoint()
      .catch((error) => live.controller.abort(error))
      .finally(() => {
        saving = null;
      });
  };
  const heartbeat = setInterval(() => {
    if (!saving) {
      saving = checkpoint()
        .catch((error) => live.controller.abort(error))
        .finally(() => {
          saving = null;
        });
    }
  }, HEARTBEAT_MS);
  const flushCheckpoint = setInterval(() => {
    if (dirty) scheduleCheckpoint();
  }, CHECKPOINT_MS);

  const emit = (event: TurnEvent) => {
    // Text or a tool call ends any open thinking; record when it ended.
    const last = live.parts.at(-1);
    if (
      (event.type === "text-delta" || event.type === "tool-call") &&
      last?.type === "thinking" &&
      last.endedAt === undefined
    )
      emit({ type: "thinking-end", at: Date.now() });
    live.parts = applyTurnEvent(live.parts, event);
    live.citations = applyCitations(live.citations, event);
    publish(live, { type: "event", event });
    scheduleCheckpoint();
  };

  const settle = async () => {
    clearInterval(heartbeat);
    clearInterval(flushCheckpoint);
    await saving;
  };

  try {
    const provider = providerFor(input.model);
    if (!provider.isConfigured())
      throw new Error("AI service is not configured. Please check the API key.");

    const history = await buildCanonicalHistory(auth.client, input.path);
    const tools = enabledToolSpecs({
      webSearchEnabled: input.settings.webSearchEnabled,
    });
    const system = buildSystemPrompt({
      request: input.request,
      context: input.context,
      webSearchEnabled: input.settings.webSearchEnabled,
    });
    const toolContext = {
      appBaseUrl: input.request.appBaseUrl,
      supabase: auth.client,
    };
    await checkpoint();

    let awaitingInput = false;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      signal.throwIfAborted();
      emit({ type: "thinking-start", at: Date.now() });
      const result = await provider.round({
        model: input.model,
        system,
        messages: live.parts.length
          ? [...history, { role: "assistant", parts: live.parts }]
          : history,
        tools,
        forceAnswer: round === MAX_ROUNDS - 1,
        webSearchEnabled: input.settings.webSearchEnabled,
        reasoningEffort: input.settings.reasoningEffort,
        signal,
        emit,
      });
      signal.throwIfAborted();
      emit({ type: "thinking-end", at: Date.now() });

      for (const call of result.nativeToolCalls ?? [])
        emit({ type: "tool-call", toolCall: call });

      const calls = result.toolCalls.flatMap((requested): ChatToolCall[] => {
        const typed = toTypedToolCall({
          id: requested.id,
          name: requested.name,
          arguments:
            requested.arguments && typeof requested.arguments === "object"
              ? (requested.arguments as Record<string, unknown>)
              : {},
        });
        if (!typed) console.warn(`Model called unknown tool ${requested.name}`);
        return typed ? [typed] : [];
      });
      if (!calls.length) break;

      for (const call of calls) emit({ type: "tool-call", toolCall: call });
      const serverCalls = calls.filter((call) => !isClientTool(call.name));
      await Promise.all(
        serverCalls.map(async (call) => {
          const raw = result.toolCalls.find((item) => item.id === call.id);
          const toolResult = await executeTool(
            call.name,
            raw?.arguments,
            toolContext
          );
          signal.throwIfAborted();
          emit({ type: "tool-result", id: call.id, result: toolResult });
        })
      );

      // A client tool needs the user, but only with input the UI can show;
      // invalid input goes back to the model like any failed tool.
      const clientCalls = calls.filter((call) => isClientTool(call.name));
      let pausing = false;
      for (const call of clientCalls) {
        const raw = result.toolCalls.find((item) => item.id === call.id);
        const parsed = toolDefinitions[call.name].input.safeParse(raw?.arguments ?? {});
        if (parsed.success) pausing = true;
        else
          emit({
            type: "tool-result",
            id: call.id,
            result: {
              success: false,
              error: `Invalid arguments for ${call.name}: ${z.prettifyError(parsed.error)}`,
            },
          });
      }
      // Pause here; answering resumes the turn.
      if (pausing) {
        awaitingInput = true;
        break;
      }
    }

    if (awaitingInput) {
      await settle();
      await checkpoint("awaiting_input");
      finishLiveTurn(live, "awaiting_input");
      return;
    }

    if (!joinTextParts(live.parts))
      emit({ type: "text-delta", delta: "I couldn't produce a response. Please try again." });
    await settle();
    const completed = await completeTurn(auth, turn, {
      parts: live.parts,
      citations: live.citations,
    });
    if (completed.error !== undefined) throw new Error(completed.error);
    finishLiveTurn(live, "completed");
  } catch (error) {
    await settle().catch(() => {});
    const reason = signal.aborted ? signal.reason : error;
    // Another writer already ended the turn (Stop elsewhere, new branch).
    if (reason instanceof TurnStopped) {
      finishLiveTurn(live, "cancelled", "Response stopped");
      return;
    }
    const cancelled = signal.aborted && !(reason instanceof Error);
    const message = cancelled
      ? "Response stopped"
      : reason instanceof Error
        ? reason.message
        : "Chat request failed";
    if (!cancelled) console.error("Chat generation failed:", reason);
    const status = cancelled ? "cancelled" : "failed";
    const failed = await failTurn(auth, turn, {
      status,
      error: message,
      parts: live.parts,
    });
    if (failed.error !== undefined)
      console.error("Unable to record chat failure:", failed.error);
    finishLiveTurn(live, status, message);
  }
}

/** Stop a turn generating in this process. */
export function cancelLiveTurn(live: LiveTurn) {
  live.controller.abort("cancelled");
}
