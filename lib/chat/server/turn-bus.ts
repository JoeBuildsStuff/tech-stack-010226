import "server-only";
import type {
  ChatMessagePart,
  ChatMessageStatus,
  Citation,
  TurnStreamMessage,
} from "@/lib/chat/contracts";

/**
 * Turns generating in this server process. A browser that reconnects to a
 * turn running here gets a snapshot and then live events; a turn running in
 * another instance is followed through its database checkpoints instead.
 */
export interface LiveTurn {
  turnId: string;
  userId: string;
  sessionId: string;
  assistantMessageId: string;
  parts: ChatMessagePart[];
  citations: Citation[];
  status: ChatMessageStatus;
  controller: AbortController;
  listeners: Set<(message: TurnStreamMessage) => void>;
}

const globalBus = globalThis as typeof globalThis & {
  __chatTurnBus?: Map<string, LiveTurn>;
};
const turns = (globalBus.__chatTurnBus ??= new Map<string, LiveTurn>());

export function registerLiveTurn(
  turn: Omit<LiveTurn, "listeners" | "controller" | "status">
): LiveTurn | null {
  if (turns.has(turn.turnId)) return null;
  const live: LiveTurn = {
    ...turn,
    status: "streaming",
    controller: new AbortController(),
    listeners: new Set(),
  };
  turns.set(turn.turnId, live);
  return live;
}

export function getLiveTurn(turnId: string, userId: string) {
  const live = turns.get(turnId);
  return live && live.userId === userId ? live : null;
}

export function publish(live: LiveTurn, message: TurnStreamMessage) {
  for (const listener of live.listeners) {
    try {
      listener(message);
    } catch {
      // A broken listener (closed stream) must not stop generation.
    }
  }
}

/** Snapshot then live messages, until the returned function unsubscribes. */
export function subscribe(
  live: LiveTurn,
  listener: (message: TurnStreamMessage) => void
) {
  listener({
    type: "snapshot",
    parts: live.parts,
    status: live.status,
    citations: live.citations,
  });
  live.listeners.add(listener);
  return () => live.listeners.delete(listener);
}

export function finishLiveTurn(live: LiveTurn, status: ChatMessageStatus, error?: string) {
  live.status = status;
  publish(live, { type: "status", status, ...(error ? { error } : {}) });
  live.listeners.clear();
  turns.delete(live.turnId);
}
