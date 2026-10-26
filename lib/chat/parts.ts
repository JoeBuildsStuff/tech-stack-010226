import type {
  ChatMessage,
  ChatMessagePart,
  ChatToolCall,
  Citation,
  TurnEvent,
} from "@/lib/chat/contracts";

/** Thinking shorter than this with no text is noise, not a "Thought 0s" row. */
const MIN_SILENT_THINKING_MS = 1000;

function closeThinking(parts: ChatMessagePart[], at: number) {
  const last = parts.at(-1);
  if (last?.type !== "thinking" || last.endedAt !== undefined) return parts;
  if (!last.text.trim() && at - last.startedAt < MIN_SILENT_THINKING_MS)
    return parts.slice(0, -1);
  return [...parts.slice(0, -1), { ...last, endedAt: at }];
}

/**
 * Fold one turn event into the ordered parts of a reply. Pure, so the server
 * (which persists the result) and the client (which renders it live) build
 * exactly the same sequence.
 */
export function applyTurnEvent(
  parts: ChatMessagePart[],
  event: TurnEvent
): ChatMessagePart[] {
  const last = parts.at(-1);
  switch (event.type) {
    case "thinking-start":
      if (last?.type === "thinking" && last.endedAt === undefined) return parts;
      return [...parts, { type: "thinking", text: "", startedAt: event.at }];
    case "thinking-delta":
      if (last?.type === "thinking" && last.endedAt === undefined)
        return [...parts.slice(0, -1), { ...last, text: last.text + event.delta }];
      return [
        ...parts,
        { type: "thinking", text: event.delta, startedAt: Date.now() },
      ];
    case "thinking-end":
      return closeThinking(parts, event.at);
    case "text-delta":
      if (last?.type === "text")
        return [...parts.slice(0, -1), { ...last, text: last.text + event.delta }];
      return [...parts, { type: "text", text: event.delta }];
    case "tool-call":
      return [...parts, { type: "tool", toolCall: event.toolCall }];
    case "tool-result":
      return parts.map((part) =>
        part.type === "tool" && part.toolCall.id === event.id
          ? {
              type: "tool",
              // The result belongs to this call's tool; the stream carries
              // results untyped, and the executor produced it for this name.
              toolCall: { ...part.toolCall, result: event.result } as ChatToolCall,
            }
          : part
      );
    case "citations":
      return parts;
  }
}

export function applyCitations(citations: Citation[], event: TurnEvent) {
  return event.type === "citations" ? [...citations, ...event.citations] : citations;
}

/** Joins text parts the way the reply is stored in `content`. */
export function joinTextParts(parts: ChatMessagePart[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function joinThinkingParts(parts: ChatMessagePart[]) {
  return parts
    .filter((part) => part.type === "thinking")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function toolCallsOf(parts: ChatMessagePart[]): ChatToolCall[] {
  return parts.flatMap((part) => (part.type === "tool" ? [part.toolCall] : []));
}

/** Tool calls the user still has to answer (client tools without a result). */
export function pendingClientToolCalls(parts: ChatMessagePart[]) {
  return toolCallsOf(parts).filter(
    (call): call is Extract<ChatToolCall, { name: "ask_user" }> =>
      call.name === "ask_user" && !call.result
  );
}

/**
 * Order for rows saved before parts were persisted: reasoning, tools, answer.
 * New rows always carry their streamed parts.
 */
export function partsOf(message: ChatMessage): ChatMessagePart[] {
  if (message.parts) return message.parts;
  return message.content.trim()
    ? [{ type: "text", text: message.content }]
    : [];
}

/**
 * When the reply's work began and ended, for "Worked for Ns": from the turn's
 * start to the end of the last thinking step before the answer.
 */
export function replyTiming(message: ChatMessage) {
  const ends = (message.parts ?? []).flatMap((part) =>
    part.type === "thinking" && part.endedAt ? [part.endedAt] : []
  );
  return {
    startedAt: message.timestamp.getTime(),
    finishedAt: ends.length ? Math.max(...ends) : undefined,
  };
}
