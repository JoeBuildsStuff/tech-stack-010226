import "server-only";
import { anthropicProvider } from "./anthropic";
import { cerebrasProvider } from "./cerebras";
import { openaiProvider, xaiProvider } from "./openai-responses";
import type { ChatProvider } from "./types";

export type { ChatProvider } from "./types";

/** The provider that serves a model id. */
export function providerFor(model: string): ChatProvider {
  if (model.startsWith("gpt-oss-")) return cerebrasProvider;
  if (model.startsWith("gpt-")) return openaiProvider;
  if (model.startsWith("grok-")) return xaiProvider;
  return anthropicProvider;
}
