import { z } from "zod";
import {
  isToolName,
  toolDefinitions,
  type ClientToolName,
  type ServerToolName,
  type ToolDefinitions,
  type ToolInput,
  type ToolName,
} from "@/lib/chat/tools/definitions";
import type { serverToolExecutors } from "@/lib/chat/server/tools";

/**
 * Chat contracts shared by the server, the client store and the UI. Nothing
 * here imports UI or store code.
 */

export type ChatRole = "user" | "assistant" | "system";
export type ChatTurnMode = "new" | "edit" | "retry";
export type ChatMessageStatus =
  | "pending"
  | "streaming"
  | "awaiting_input"
  | "completed"
  | "failed"
  | "cancelled";
export type ReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export const ACTIVE_STATUSES: ReadonlySet<ChatMessageStatus> = new Set([
  "pending",
  "streaming",
]);

// ─── Tools ──────────────────────────────────────────────────────────────────

export type ToolResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

type ExecutorSuccess<N extends ServerToolName> = Extract<
  Awaited<ReturnType<(typeof serverToolExecutors)[N]>>,
  { success: true }
>;

export type ToolOutput<N extends ToolName> = N extends ClientToolName
  ? z.infer<NonNullable<ToolDefinitions[N]["output"]>>
  : N extends ServerToolName
    ? ExecutorSuccess<N>["data"]
    : never;

/**
 * One tool invocation, discriminated by `name`. Arguments are partial because
 * a model can send incomplete input; executors validate before running.
 */
export type ChatToolCall<N extends ToolName = ToolName> =
  | {
      [K in N]: {
        id: string;
        name: K;
        arguments: Partial<ToolInput<K>>;
        result?: ToolResult<ToolOutput<K>>;
        native?: false;
      };
    }[N]
  | Extract<NativeToolCall, { name: N }>;

/**
 * A search the provider ran itself (Claude's native web search, used when no
 * shared search provider is configured). Its result is provider-shaped.
 */
export interface NativeToolCall {
  id: string;
  name: "web_search";
  arguments: { query?: string };
  result?: ToolResult<unknown>;
  native: true;
}

// ─── Message parts ──────────────────────────────────────────────────────────

/** One step of an assistant reply, in the order it streamed. */
export type ThinkingPart = {
  type: "thinking";
  text: string;
  startedAt: number;
  endedAt?: number;
};
export type TextPart = { type: "text"; text: string };
export type ToolPart = { type: "tool"; toolCall: ChatToolCall };
export type ChatMessagePart = ThinkingPart | TextPart | ToolPart;

export interface Citation {
  url: string;
  title: string;
  cited_text: string;
}

export interface ChatAction {
  type: "filter" | "sort" | "navigate" | "create" | "function_call";
  label: string;
  payload: Record<string, unknown>;
}

export interface PageContext {
  currentFilters: Record<string, unknown>;
  currentSort: Record<string, unknown>;
  visibleData: Record<string, unknown>[];
  totalCount: number;
}

export interface ChatSettings {
  reasoningEffort?: ReasoningEffort | null;
  webSearchEnabled: boolean;
}

/** Request facts captured when a turn begins, reused when it resumes. */
export interface ChatTurnRequest {
  clientTz?: string;
  clientUtcOffset?: string;
  clientNowIso?: string;
  clientPath?: string;
  appBaseUrl?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

/** The message shape the store and UI render. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: Date;
  parts?: ChatMessagePart[];
  turnId?: string | null;
  parentId?: string | null;
  status?: ChatMessageStatus;
  model?: string | null;
  settings?: ChatSettings;
  branchInfo?: {
    current: number;
    total: number;
    previousId?: string;
    nextId?: string;
  };
  attachments?: ChatAttachment[];
  suggestedActions?: ChatAction[];
  citations?: Citation[];
}

// ─── Stream events ──────────────────────────────────────────────────────────

/**
 * Events from a running turn. The server and client fold them into parts with
 * the same reducer (`lib/chat/parts.ts`), so both sides agree on the order.
 */
export type TurnEvent =
  | { type: "thinking-start"; at: number }
  | { type: "thinking-delta"; delta: string }
  | { type: "thinking-end"; at: number }
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; toolCall: ChatToolCall }
  | { type: "tool-result"; id: string; result: ToolResult }
  | { type: "citations"; citations: Citation[] };

export type TurnStreamMessage =
  | { type: "event"; event: TurnEvent }
  /** Full state, sent first when (re)attaching to a turn. */
  | {
      type: "snapshot";
      parts: ChatMessagePart[];
      status: ChatMessageStatus;
      citations: Citation[];
    }
  | { type: "status"; status: ChatMessageStatus; error?: string };

// ─── Runtime parsing of persisted JSON ──────────────────────────────────────

const toolResultSchema = z.union([
  z.object({ success: z.literal(true), data: z.unknown() }),
  z.object({ success: z.literal(false), error: z.string() }),
  // Rows written before results were a discriminated union.
  z
    .object({
      success: z.boolean(),
      data: z.unknown().optional(),
      error: z.string().optional(),
    })
    .transform((value): ToolResult =>
      value.success
        ? { success: true, data: value.data }
        : { success: false, error: value.error ?? "Tool failed" }
    ),
]);

const rawToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).catch({}),
  result: toolResultSchema.optional().catch(undefined),
  native: z.boolean().optional(),
});

const rawPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("thinking"),
    text: z.string(),
    startedAt: z.number(),
    endedAt: z.number().optional(),
  }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool"), toolCall: rawToolCallSchema }),
]);

/**
 * Narrow an untyped tool call to the typed union. Unknown tools (removed since
 * the call was saved) return null. Arguments are checked against the current
 * schema; fields that no longer validate are dropped rather than trusted.
 */
export function toTypedToolCall(
  raw: z.infer<typeof rawToolCallSchema>
): ChatToolCall | null {
  if (!isToolName(raw.name)) return null;
  const schema = toolDefinitions[raw.name].input.partial();
  const parsed = schema.safeParse(raw.arguments);
  const args = parsed.success
    ? parsed.data
    : Object.fromEntries(
        Object.entries(raw.arguments).filter(
          ([key, value]) =>
            (schema.shape as Record<string, z.ZodType | undefined>)[key]?.safeParse(value)
              .success
        )
      );
  // The parsed object matches the partial input schema of `raw.name`, which
  // is what ChatToolCall<typeof raw.name> requires.
  return {
    id: raw.id,
    name: raw.name,
    arguments: args,
    ...(raw.result ? { result: raw.result } : {}),
    ...(raw.native ? { native: true } : {}),
  } as ChatToolCall;
}

export function parseMessageParts(value: unknown): ChatMessagePart[] | null {
  if (!Array.isArray(value)) return null;
  const parts: ChatMessagePart[] = [];
  for (const item of value) {
    const parsed = rawPartSchema.safeParse(item);
    if (!parsed.success) continue;
    if (parsed.data.type !== "tool") {
      parts.push(parsed.data);
      continue;
    }
    const toolCall = toTypedToolCall(parsed.data.toolCall);
    if (toolCall) parts.push({ type: "tool", toolCall });
  }
  return parts;
}

export function parseToolCalls(value: unknown): ChatToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = rawToolCallSchema.safeParse({
      id: crypto.randomUUID(),
      ...(item && typeof item === "object" ? item : {}),
    });
    const call = parsed.success ? toTypedToolCall(parsed.data) : null;
    return call ? [call] : [];
  });
}

const citationSchema = z.object({
  url: z.string(),
  title: z.string().catch(""),
  cited_text: z.string().catch(""),
});

export function parseCitations(value: unknown): Citation[] {
  return z.array(citationSchema).catch([]).parse(value ?? []);
}

const actionSchema = z.object({
  type: z.enum(["filter", "sort", "navigate", "create", "function_call"]),
  label: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export function parseActions(value: unknown): ChatAction[] {
  return z.array(actionSchema).catch([]).parse(value ?? []);
}

const reasoningEffortSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export function parseSettings(value: unknown): ChatSettings {
  const raw = z
    .object({
      reasoningEffort: reasoningEffortSchema.nullish().catch(null),
      webSearchEnabled: z.boolean().optional().catch(undefined),
    })
    .catch({ reasoningEffort: null, webSearchEnabled: undefined })
    .parse(value ?? {});
  return {
    reasoningEffort: raw.reasoningEffort ?? null,
    webSearchEnabled: raw.webSearchEnabled !== false,
  };
}

export function parseTurnRequest(value: unknown): ChatTurnRequest {
  return z
    .object({
      clientTz: z.string().optional(),
      clientUtcOffset: z.string().optional(),
      clientNowIso: z.string().optional(),
      clientPath: z.string().optional(),
      appBaseUrl: z.string().optional(),
    })
    .catch({})
    .parse(value ?? {});
}

export function parsePageContext(value: unknown): PageContext | null {
  const parsed = z
    .object({
      currentFilters: z.record(z.string(), z.unknown()),
      currentSort: z.record(z.string(), z.unknown()),
      visibleData: z.array(z.record(z.string(), z.unknown())),
      totalCount: z.number(),
    })
    .safeParse(value);
  return parsed.success ? parsed.data : null;
}

export { reasoningEffortSchema };
