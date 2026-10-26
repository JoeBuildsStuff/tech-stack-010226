import "server-only";
import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import {
  parseCitations,
  parseMessageParts,
  type ChatMessageStatus,
  type TurnStreamMessage,
} from "@/lib/chat/contracts";
import type { TurnStartMessage } from "@/lib/chat/conversation-types";
import { expireStaleTurns, getTurn, type ChatAuth } from "./conversation-service";
import { subscribe, type LiveTurn } from "./turn-bus";

const encoder = new TextEncoder();
const FOLLOW_INTERVAL_MS = 1000;
/** A follower gives up after this long; the browser reconnects if still open. */
const FOLLOW_LIMIT_MS = 5 * 60_000;

const isRunning = (status: ChatMessageStatus) =>
  status === "pending" || status === "streaming";

type StreamMessage = TurnStreamMessage | TurnStartMessage;

function sseResponse(
  start: (send: (message: StreamMessage) => void, close: () => void) => () => void
) {
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        controller.close();
      };
      const send = (message: StreamMessage) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
        } catch {
          close();
        }
      };
      cleanup = start(send, close);
    },
    // The browser went away; generation carries on regardless.
    cancel() {
      cleanup();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Stream a turn running in this process, optionally preceded by its start info. */
export function streamLiveTurn(live: LiveTurn, first?: TurnStartMessage) {
  return sseResponse((send, close) => {
    if (first) send(first);
    const unsubscribe = subscribe(live, (message) => {
      send(message);
      if (message.type === "status" && !isRunning(message.status)) close();
    });
    if (!isRunning(live.status)) queueMicrotask(close);
    return unsubscribe;
  });
}

/**
 * Follow a turn through its database checkpoints. Used when the turn is
 * generating in another server instance, or has already finished.
 */
export function streamPersistedTurn(auth: ChatAuth, turnId: string, first?: TurnStartMessage) {
  return sseResponse((send, close) => {
    let stopped = false;
    let lastSnapshot = "";
    const startedAt = Date.now();

    const poll = async () => {
      while (!stopped) {
        const turn = await getTurn(auth, turnId);
        if (turn.error !== undefined || !turn.data.assistantMessageId) {
          send({ type: "status", status: "failed", error: turn.error ?? "Chat turn not found" });
          return close();
        }
        if (isRunning(turn.data.status)) await expireStaleTurns(auth, turn.data.sessionId);
        const { data: row } = await auth.client
          .schema(APP_SCHEMA)
          .from("chat_messages")
          .select("parts, status, citations")
          .eq("id", turn.data.assistantMessageId)
          .maybeSingle();
        const status: ChatMessageStatus = row?.status ?? turn.data.status;
        const snapshot: TurnStreamMessage = {
          type: "snapshot",
          parts: parseMessageParts(row?.parts) ?? [],
          status,
          citations: parseCitations(row?.citations),
        };
        const serialized = JSON.stringify(snapshot);
        if (serialized !== lastSnapshot) {
          lastSnapshot = serialized;
          send(snapshot);
        }
        if (!isRunning(status) || Date.now() - startedAt > FOLLOW_LIMIT_MS) {
          send({ type: "status", status, ...(turn.data.error ? { error: turn.data.error } : {}) });
          return close();
        }
        await new Promise((resolve) => setTimeout(resolve, FOLLOW_INTERVAL_MS));
      }
    };

    if (first) send(first);
    void poll().catch((error) => {
      send({
        type: "status",
        status: "failed",
        error: error instanceof Error ? error.message : "Unable to follow the response",
      });
      close();
    });
    return () => {
      stopped = true;
    };
  });
}
