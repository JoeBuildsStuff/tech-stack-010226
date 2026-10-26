import type { TurnStreamMessage } from "@/lib/chat/contracts";
import type { TurnStartMessage } from "@/lib/chat/conversation-types";

export type TurnStreamFrame = TurnStreamMessage | TurnStartMessage;

/**
 * Read a turn's server-sent events. Each frame is one JSON message; the
 * stream ends when the turn stops running or the connection drops.
 */
export async function readTurnStream(
  response: Response,
  onMessage: (message: TurnStreamFrame) => void,
  signal: AbortSignal
) {
  if (!response.body) throw new Error("Chat stream is unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleFrame = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    if (data) onMessage(JSON.parse(data) as TurnStreamFrame);
  };

  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) if (frame.trim()) handleFrame(frame);
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleFrame(buffer);
    signal.throwIfAborted();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
