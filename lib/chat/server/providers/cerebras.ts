import "server-only";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
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

let client: Cerebras | null = null;
const getClient = () =>
  (client ??= new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY || "" }));

type CerebrasMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; content: string; tool_call_id: string };

interface CerebrasStreamingChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

/** Chat Completions takes text only, so attachments are inlined or described. */
export function toCerebrasMessages(
  system: string,
  messages: CanonicalMessage[],
  toolNames: ReadonlySet<string>
): CerebrasMessage[] {
  const out: CerebrasMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") {
      const files = message.attachments.map(attachmentAsText);
      out.push({
        role: "user",
        content: [...files, message.text || "(attachments only)"].join("\n\n"),
      });
      continue;
    }
    for (const round of assistantRounds(message.parts)) {
      const replayable = round.toolCalls.filter(
        (call) => !call.native && toolNames.has(call.name)
      );
      const inlined = round.toolCalls.filter((call) => !replayable.includes(call));
      const content = [round.text.trim(), ...inlined.map(describeToolCallAsText)]
        .filter(Boolean)
        .join("\n\n");
      if (!content && !replayable.length) continue;
      out.push({
        role: "assistant",
        content,
        ...(replayable.length
          ? {
              tool_calls: replayable.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              })),
            }
          : {}),
      });
      for (const call of replayable)
        out.push({ role: "tool", tool_call_id: call.id, content: toolResultText(call) });
    }
  }
  return out;
}

async function round(input: ProviderRoundInput) {
  const toolNames = new Set(input.tools.map((tool) => tool.name));
  const effort =
    input.reasoningEffort === "medium" || input.reasoningEffort === "high"
      ? input.reasoningEffort
      : "low";
  const response = await getClient().chat.completions.create(
    {
      model: input.model,
      messages: toCerebrasMessages(input.system, input.messages, toolNames),
      stream: true,
      max_completion_tokens: 65536,
      reasoning_effort: effort,
      ...(input.tools.length
        ? {
            tool_choice: input.forceAnswer ? ("none" as const) : ("auto" as const),
            tools: input.tools.map((tool) => ({
              type: "function" as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
          }
        : {}),
    },
    { signal: input.signal }
  );

  const calls: Array<{ id: string; name: string; arguments: string }> = [];
  const byIndex = new Map<number, number>();
  for await (const chunk of response as AsyncIterable<CerebrasStreamingChunk>) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.reasoning) input.emit({ type: "thinking-delta", delta: delta.reasoning });
    if (delta.content) input.emit({ type: "text-delta", delta: delta.content });
    for (const fragment of delta.tool_calls ?? []) {
      let position = byIndex.get(fragment.index);
      if (position === undefined) {
        position = calls.length;
        byIndex.set(fragment.index, position);
        calls.push({ id: "", name: "", arguments: "" });
      }
      const call = calls[position];
      if (fragment.id) call.id = fragment.id;
      if (fragment.function?.name) call.name = fragment.function.name;
      if (fragment.function?.arguments) call.arguments += fragment.function.arguments;
    }
  }

  const toolCalls: RequestedToolCall[] = calls.map((call) => ({
    id: call.id || crypto.randomUUID(),
    name: call.name,
    arguments: parseArguments(call.arguments),
  }));
  return { toolCalls };
}

export const cerebrasProvider: ChatProvider = {
  id: "cerebras",
  isConfigured: () => Boolean(process.env.CEREBRAS_API_KEY),
  round,
};
