import "server-only";
import {
  CONTEXT_CATEGORY_LABELS,
  contextWindowFor,
  estimateAttachmentTokens,
  estimateTextTokens,
  type ContextCategoryId,
  type ContextUsage,
} from "@/lib/chat/context-usage";
import type { ChatTurnRequest } from "@/lib/chat/contracts";
import { assistantRounds, toolResultText } from "./history";
import { loadConversation, type ChatAuth } from "./conversation-service";
import { buildSystemPrompt } from "./system-prompt";
import { enabledToolSpecs } from "./tools";

/**
 * Estimate what the next request in a conversation would send, by category.
 * Mirrors the turn runner: same system prompt, tools and history (completed
 * messages on the selected path; thinking is never sent).
 */
export async function estimateContextUsage(
  auth: ChatAuth,
  options: {
    sessionId: string | null;
    model: string;
    webSearchEnabled: boolean;
    request: ChatTurnRequest;
  }
): Promise<{ data: ContextUsage } | { error: string }> {
  const tokens: Record<ContextCategoryId, number> = {
    system: estimateTextTokens(
      buildSystemPrompt({
        request: options.request,
        context: null,
        webSearchEnabled: options.webSearchEnabled,
      })
    ),
    tools: estimateTextTokens(
      JSON.stringify(enabledToolSpecs({ webSearchEnabled: options.webSearchEnabled }))
    ),
    messages: 0,
    toolResults: 0,
    attachments: 0,
    draft: 0,
  };

  if (options.sessionId) {
    const conversation = await loadConversation(auth, options.sessionId);
    if (conversation.error !== undefined) return { error: conversation.error };
    for (const message of conversation.data.selectedPath) {
      if (message.status !== "completed") continue;
      if (message.role === "user") {
        tokens.messages += estimateTextTokens(message.content);
        for (const attachment of message.attachments)
          tokens.attachments += estimateAttachmentTokens({
            name: attachment.name,
            type: attachment.mimeType,
            size: attachment.size,
          });
        continue;
      }
      for (const round of assistantRounds(message.parts)) {
        tokens.messages += estimateTextTokens(round.text);
        for (const call of round.toolCalls)
          tokens.toolResults += estimateTextTokens(
            JSON.stringify(call.arguments) + toolResultText(call)
          );
      }
    }
  }

  const ids: ContextCategoryId[] = ["system", "tools", "messages", "toolResults", "attachments"];
  return {
    data: {
      model: options.model,
      contextWindow: contextWindowFor(options.model),
      categories: ids.map((id) => ({
        id,
        label: CONTEXT_CATEGORY_LABELS[id],
        tokens: tokens[id],
      })),
    },
  };
}
