export interface ToolCallResponse {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  reasoning?: string;
}

export interface ActionResponse {
  type: "filter" | "sort" | "navigate" | "create" | "function_call";
  label: string;
  payload: Record<string, unknown>;
}

export interface ChatStreamResult {
  message?: string;
  reasoning?: string;
  functionResult?: { success: boolean; data?: unknown; error?: string };
  actions?: ActionResponse[];
  toolCalls?: ToolCallResponse[];
  citations?: Array<{
    url: string;
    title: string;
    cited_text: string;
  }>;
}

export interface StreamToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: { success: boolean; data?: unknown; error?: string };
}

export interface ChatStreamHandlers {
  onToolCall?: (toolCall: StreamToolCall) => void;
  onToolResult?: (toolResult: {
    id: string;
    result: { success: boolean; data?: unknown; error?: string };
  }) => void;
}

export async function readChatStream(
  response: Response,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
  handlers?: ChatStreamHandlers
): Promise<ChatStreamResult> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    return (await response.json()) as ChatStreamResult;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ChatStreamResult | null = null;

  const handleFrame = (frame: string) => {
    let event = "message";
    const dataLines: string[] = [];

    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    if (dataLines.length === 0) return;
    const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;

    if (event === "delta" && typeof payload.delta === "string") {
      onDelta(payload.delta);
    } else if (event === "tool_call" && handlers?.onToolCall) {
      handlers.onToolCall(payload as unknown as StreamToolCall);
    } else if (event === "tool_result" && handlers?.onToolResult) {
      handlers.onToolResult(
        payload as unknown as {
          id: string;
          result: { success: boolean; data?: unknown; error?: string };
        }
      );
    } else if (event === "done") {
      finalResult = payload as ChatStreamResult;
    } else if (event === "error") {
      throw new Error(
        typeof payload.message === "string"
          ? payload.message
          : "Chat stream failed"
      );
    }
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
    if (!finalResult)
      throw new Error("Chat stream ended before completion. Please retry.");
    return finalResult;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
