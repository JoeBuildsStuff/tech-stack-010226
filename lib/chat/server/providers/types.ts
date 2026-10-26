import "server-only";
import type { ChatToolCall, ReasoningEffort, TurnEvent } from "@/lib/chat/contracts";
import type { ToolSpec } from "@/lib/chat/server/tools";
import type { CanonicalMessage } from "@/lib/chat/server/history";

export interface ProviderRoundInput {
  model: string;
  system: string;
  messages: CanonicalMessage[];
  tools: ToolSpec[];
  /** Last allowed round: the model must answer instead of calling tools. */
  forceAnswer: boolean;
  webSearchEnabled: boolean;
  reasoningEffort?: ReasoningEffort | null;
  signal: AbortSignal;
  /** Streams thinking, text and citation events; tool calls are returned. */
  emit: (event: TurnEvent) => void;
}

export interface RequestedToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ProviderRoundResult {
  /** Tools the model asked us to run, in order. Empty when it answered. */
  toolCalls: RequestedToolCall[];
  /** Tools the provider ran itself (already finished), shown in the trace. */
  nativeToolCalls?: ChatToolCall[];
}

/**
 * One provider. A round is a single model call: it streams what the model
 * says and returns the tool calls it made. The tool loop is shared.
 */
export interface ChatProvider {
  id: "anthropic" | "openai" | "xai" | "cerebras";
  isConfigured(): boolean;
  round(input: ProviderRoundInput): Promise<ProviderRoundResult>;
}

export function parseArguments(value: string): unknown {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}
