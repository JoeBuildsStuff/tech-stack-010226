import type { ChatMessage, ChatMessagePart, ToolCall } from "../chat-store";
import type { StreamToolCall } from "./stream";

/** Thinking shorter than this with no text is noise, not a "Thought 0s" row. */
const MIN_SILENT_THINKING_MS = 1000;
const CACHE_LIMIT = 200;

type StreamedShape = Pick<ChatMessage, "parts" | "startedAt" | "finishedAt">;

/**
 * The DB keeps content, reasoning and tool calls in separate columns with no
 * ordering between them, so the streamed order is kept here and laid back over
 * the persisted message when the conversation refreshes after completion.
 */
const streamedShapes = new Map<string, StreamedShape>();

export function rememberStreamedShape(messageId: string, shape: StreamedShape) {
  streamedShapes.delete(messageId);
  streamedShapes.set(messageId, shape);
  if (streamedShapes.size > CACHE_LIMIT) {
    const oldest = streamedShapes.keys().next().value;
    if (oldest) streamedShapes.delete(oldest);
  }
}

export function withStreamedShape(message: ChatMessage): ChatMessage {
  const shape = streamedShapes.get(message.id);
  return shape ? { ...message, ...shape } : message;
}

/** Joins text parts the same way the server joins rounds of text. */
export function joinTextParts(parts: ChatMessagePart[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Accumulates stream events into ordered parts. A thinking part is open from
 * the start of the turn and again after each batch of tool results, until the
 * model emits its next text or tool call.
 */
export function createPartsBuilder(now: () => number = Date.now) {
  const parts: ChatMessagePart[] = [];

  const openThinking = () => {
    parts.push({ type: "thinking", text: "", startedAt: now() });
  };

  const closeThinking = () => {
    const last = parts[parts.length - 1];
    if (last?.type !== "thinking" || last.endedAt !== undefined) return;
    last.endedAt = now();
    if (!last.text.trim() && last.endedAt - last.startedAt < MIN_SILENT_THINKING_MS)
      parts.pop();
  };

  openThinking();

  return {
    snapshot(): ChatMessagePart[] {
      return parts.map((part) =>
        part.type === "tool"
          ? { type: "tool", toolCall: { ...part.toolCall } }
          : { ...part }
      );
    },
    reasoning(delta: string) {
      const last = parts[parts.length - 1];
      if (last?.type === "thinking" && last.endedAt === undefined)
        last.text += delta;
      else parts.push({ type: "thinking", text: delta, startedAt: now() });
    },
    text(delta: string) {
      closeThinking();
      const last = parts[parts.length - 1];
      if (last?.type === "text") last.text += delta;
      else parts.push({ type: "text", text: delta });
    },
    toolCall(tool: StreamToolCall) {
      closeThinking();
      parts.push({ type: "tool", toolCall: { ...tool } as ToolCall });
    },
    toolResult(id: string, result: NonNullable<ToolCall["result"]>) {
      const part = parts.find(
        (item) => item.type === "tool" && item.toolCall.id === id
      );
      if (part?.type === "tool") part.toolCall = { ...part.toolCall, result };
      const pending = parts.some(
        (item) => item.type === "tool" && !item.toolCall.result
      );
      // Every call is back: the model is deciding what to do next.
      if (!pending && parts[parts.length - 1]?.type === "tool") openThinking();
    },
    finish() {
      closeThinking();
    },
  };
}

/** Best-effort order for messages that were never streamed in this tab. */
export function derivePartsFromMessage(message: ChatMessage): ChatMessagePart[] {
  if (message.parts) return message.parts;
  const parts: ChatMessagePart[] = [];
  if (message.reasoning)
    parts.push({ type: "thinking", text: message.reasoning, startedAt: 0, endedAt: 0 });
  for (const toolCall of message.toolCalls ?? [])
    parts.push({ type: "tool", toolCall });
  if (message.content.trim()) parts.push({ type: "text", text: message.content });
  return parts;
}
