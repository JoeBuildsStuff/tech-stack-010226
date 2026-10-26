import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatToolCall, Citation, NativeToolCall } from "@/lib/chat/contracts";
import {
  assistantRounds,
  attachmentAsText,
  describeToolCallAsText,
  toolResultText,
  type CanonicalMessage,
} from "@/lib/chat/server/history";
import type { ChatProvider, ProviderRoundInput, RequestedToolCall } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
const MAX_TOKENS = 16000;

type Block = Anthropic.ContentBlockParam;

/** Anthropic tool ids allow only [a-zA-Z0-9_-]; ids from other providers may not. */
const toolUseId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");

function userBlocks(message: Extract<CanonicalMessage, { role: "user" }>): Block[] {
  const blocks: Block[] = [];
  for (const attachment of message.attachments) {
    const { content } = attachment;
    if (content.kind === "image") {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: content.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: content.base64,
        },
      });
    } else if (content.kind === "pdf") {
      blocks.push({
        type: "document",
        title: attachment.name,
        source: { type: "base64", media_type: "application/pdf", data: content.base64 },
      });
    } else {
      blocks.push({ type: "text", text: attachmentAsText(attachment) });
    }
  }
  blocks.push({ type: "text", text: message.text || "(attachments only)" });
  return blocks;
}

export function toAnthropicMessages(
  messages: CanonicalMessage[],
  toolNames: ReadonlySet<string>
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  // The API wants alternating roles; merge consecutive turns of one role.
  const push = (role: "user" | "assistant", content: Block[]) => {
    if (!content.length) return;
    const last = out.at(-1);
    if (last?.role === role && Array.isArray(last.content)) last.content.push(...content);
    else out.push({ role, content });
  };

  for (const message of messages) {
    if (message.role === "user") {
      push("user", userBlocks(message));
      continue;
    }
    for (const round of assistantRounds(message.parts)) {
      const replayable = round.toolCalls.filter(
        (call) => !call.native && toolNames.has(call.name)
      );
      const inlined = round.toolCalls.filter((call) => !replayable.includes(call));
      const text = [round.text.trim(), ...inlined.map(describeToolCallAsText)]
        .filter(Boolean)
        .join("\n\n");
      push("assistant", [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...replayable.map((call) => ({
          type: "tool_use" as const,
          id: toolUseId(call.id),
          name: call.name,
          input: call.arguments,
        })),
      ]);
      push(
        "user",
        replayable.map((call) => ({
          type: "tool_result" as const,
          tool_use_id: toolUseId(call.id),
          content: toolResultText(call),
          is_error: call.result?.success === false,
        }))
      );
    }
  }
  return out;
}

function citationsOf(content: Anthropic.ContentBlock[]): Citation[] {
  const citations: Citation[] = [];
  for (const block of content) {
    if (block.type !== "text") continue;
    for (const citation of block.citations ?? []) {
      if (citation.type !== "web_search_result_location") continue;
      citations.push({
        url: citation.url,
        title: citation.title ?? "",
        cited_text: citation.cited_text,
      });
    }
  }
  return citations;
}

function nativeSearchCalls(content: Anthropic.ContentBlock[]): NativeToolCall[] {
  return content.flatMap((block): NativeToolCall[] => {
    if (block.type !== "server_tool_use" || block.name !== "web_search") return [];
    const result = content.find(
      (item) => item.type === "web_search_tool_result" && item.tool_use_id === block.id
    );
    const input = block.input as { query?: unknown };
    return [
      {
        id: block.id,
        name: "web_search",
        native: true,
        arguments: typeof input.query === "string" ? { query: input.query } : {},
        ...(result && result.type === "web_search_tool_result"
          ? { result: { success: true as const, data: result.content } }
          : {}),
      },
    ];
  });
}

async function round(input: ProviderRoundInput) {
  const toolNames = new Set(input.tools.map((tool) => tool.name));
  const tools: Anthropic.ToolUnion[] = input.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));
  // Claude's own search is the fallback when no shared provider is configured.
  if (input.webSearchEnabled && !toolNames.has("web_search"))
    tools.push({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: parseInt(process.env.WEB_SEARCH_MAX_USES || "5", 10),
    });

  const messages = toAnthropicMessages(input.messages, toolNames);
  const effort = input.reasoningEffort && input.reasoningEffort !== "none" ? input.reasoningEffort : null;
  const nativeToolCalls: ChatToolCall[] = [];

  // pause_turn: the API stopped mid-way through a server tool; send the
  // partial turn back so it continues where it left off.
  for (let continuation = 0; continuation < 5; continuation++) {
    const stream = client.messages.stream(
      {
        model: input.model,
        max_tokens: MAX_TOKENS,
        system: input.system,
        messages,
        ...(tools.length
          ? { tools, tool_choice: { type: input.forceAnswer ? "none" : "auto" } }
          : {}),
        ...(effort ? { output_config: { effort } } : {}),
      },
      { signal: input.signal }
    );
    stream.on("text", (delta) => input.emit({ type: "text-delta", delta }));
    stream.on("thinking", (delta) => input.emit({ type: "thinking-delta", delta }));
    const response = await stream.finalMessage();

    const citations = citationsOf(response.content);
    if (citations.length) input.emit({ type: "citations", citations });
    nativeToolCalls.push(...nativeSearchCalls(response.content));

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    const toolCalls: RequestedToolCall[] = response.content.flatMap((block) =>
      block.type === "tool_use"
        ? [{ id: block.id, name: block.name, arguments: block.input }]
        : []
    );
    return { toolCalls, nativeToolCalls };
  }
  return { toolCalls: [], nativeToolCalls };
}

export const anthropicProvider: ChatProvider = {
  id: "anthropic",
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  round,
};
