import "server-only";
import OpenAI from "openai";
import type {
  ResponseInputContent,
  ResponseInputItem,
  Tool,
} from "openai/resources/responses/responses";
import type { ReasoningEffort } from "@/lib/chat/contracts";
import {
  assistantRounds,
  attachmentAsText,
  describeToolCallAsText,
  toolResultText,
  type CanonicalMessage,
} from "@/lib/chat/server/history";
import {
  parseArguments,
  type ChatProvider,
  type ProviderRoundInput,
  type RequestedToolCall,
} from "./types";

interface ResponsesProviderOptions {
  id: "openai" | "xai";
  apiKeyEnv: "OPENAI_API_KEY" | "XAI_API_KEY";
  baseURL?: string;
  /** Whether the API takes PDFs as input_file items. */
  supportsPdf: boolean;
  reasoning: (effort: ReasoningEffort | null | undefined) => OpenAI.Reasoning | undefined;
}

export function toResponsesInput(
  messages: CanonicalMessage[],
  toolNames: ReadonlySet<string>,
  supportsPdf: boolean
): ResponseInputItem[] {
  const input: ResponseInputItem[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const content: ResponseInputContent[] = [];
      for (const attachment of message.attachments) {
        const { content: file } = attachment;
        if (file.kind === "image")
          content.push({
            type: "input_image",
            image_url: `data:${file.mediaType};base64,${file.base64}`,
            detail: "auto",
          });
        else if (file.kind === "pdf" && supportsPdf)
          content.push({
            type: "input_file",
            filename: attachment.name,
            file_data: `data:application/pdf;base64,${file.base64}`,
          });
        else content.push({ type: "input_text", text: attachmentAsText(attachment) });
      }
      content.push({ type: "input_text", text: message.text || "(attachments only)" });
      input.push({ role: "user", content });
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
      if (text) input.push({ role: "assistant", content: text });
      for (const call of replayable) {
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        });
        input.push({
          type: "function_call_output",
          call_id: call.id,
          output: toolResultText(call),
        });
      }
    }
  }
  return input;
}

function createResponsesProvider(options: ResponsesProviderOptions): ChatProvider {
  let client: OpenAI | null = null;
  const getClient = () =>
    (client ??= new OpenAI({
      apiKey: process.env[options.apiKeyEnv] || "",
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    }));

  async function round(input: ProviderRoundInput) {
    const toolNames = new Set(input.tools.map((tool) => tool.name));
    const tools: Tool[] = input.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    }));
    const stream = await getClient().responses.create(
      {
        model: input.model,
        instructions: input.system,
        input: toResponsesInput(input.messages, toolNames, options.supportsPdf),
        ...(tools.length
          ? { tools, tool_choice: input.forceAnswer ? "none" : "auto" }
          : {}),
        reasoning: options.reasoning(input.reasoningEffort),
        stream: true,
      },
      { signal: input.signal }
    );

    const toolCalls: RequestedToolCall[] = [];
    for await (const event of stream) {
      switch (event.type) {
        case "response.output_text.delta":
          input.emit({ type: "text-delta", delta: event.delta });
          break;
        case "response.reasoning_summary_text.delta":
        case "response.reasoning_text.delta":
          input.emit({ type: "thinking-delta", delta: event.delta });
          break;
        case "response.output_item.done":
          if (event.item.type === "function_call")
            toolCalls.push({
              id: event.item.call_id,
              name: event.item.name,
              arguments: parseArguments(event.item.arguments),
            });
          break;
        case "error":
          throw new Error(event.message || `${options.id} stream error`);
        case "response.failed":
          throw new Error(event.response.error?.message || `${options.id} response failed`);
      }
    }
    return { toolCalls };
  }

  return {
    id: options.id,
    isConfigured: () => Boolean(process.env[options.apiKeyEnv]),
    round,
  };
}

export const openaiProvider = createResponsesProvider({
  id: "openai",
  apiKeyEnv: "OPENAI_API_KEY",
  supportsPdf: true,
  // A summary streams as reasoning deltas, giving "Thought Ns" rows text.
  reasoning: (effort) =>
    effort && effort !== "max"
      ? { effort, ...(effort !== "none" && { summary: "auto" as const }) }
      : undefined,
});

export const xaiProvider = createResponsesProvider({
  id: "xai",
  apiKeyEnv: "XAI_API_KEY",
  baseURL: "https://api.x.ai/v1",
  supportsPdf: false,
  // grok-4.5 supports low/medium/high and defaults to high.
  reasoning: (effort) => ({
    effort: effort === "low" || effort === "medium" ? effort : "high",
  }),
});
