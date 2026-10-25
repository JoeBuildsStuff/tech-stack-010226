"use client";

import type { ReactNode } from "react";
import type { ChatMessagePart, ToolCall } from "@/lib/chat/chat-store";
import { cn } from "@/lib/utils";
import {
  Trace,
  TraceLine,
  TraceTitle,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "@/components/ui/trace";
import { ToolCallCode } from "@/components/ui/tool-call";
import { formatToolCallResult } from "@/lib/chat/utils";

type Step =
  | { kind: "thinking"; part: Extract<ChatMessagePart, { type: "thinking" }> }
  | { kind: "text"; text: string; index: number }
  | { kind: "tools"; tools: ToolCall[] };

interface ChatMessageTraceProps {
  parts: ChatMessagePart[];
  streaming: boolean;
  startedAt?: number;
  finishedAt?: number;
  renderText: (text: string, key: string, isLast: boolean) => ReactNode;
}

// Verbs a tool name can contain, as [past, progressive]. Names look like
// `notes_create_note` (namespace_verb_object) or `search_web` (verb_object).
const TOOL_VERBS: Record<string, [string, string]> = {
  list: ["Listed", "Listing"],
  create: ["Created", "Creating"],
  add: ["Added", "Adding"],
  update: ["Updated", "Updating"],
  edit: ["Edited", "Editing"],
  set: ["Set", "Setting"],
  delete: ["Deleted", "Deleting"],
  remove: ["Removed", "Removing"],
  get: ["Fetched", "Fetching"],
  fetch: ["Fetched", "Fetching"],
  read: ["Read", "Reading"],
  search: ["Searched", "Searching"],
  find: ["Found", "Finding"],
  query: ["Queried", "Querying"],
  run: ["Ran", "Running"],
  generate: ["Generated", "Generating"],
  summarize: ["Summarized", "Summarizing"],
};
const DETAIL_KEYS = ["title", "query", "q", "name", "url", "path", "noteId", "id"];

/** Arguments the server injects into every call; noise in the UI. */
export function visibleToolArguments(args: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(args ?? {}).filter(([key]) => !key.startsWith("client_"))
  );
}

function truncate(value: string, max = 48) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function describeToolCall(toolCall: ToolCall) {
  const tokens = toolCall.name.split(/[_\-.]/).filter(Boolean);
  const verbIndex = tokens.findIndex((token) => token.toLowerCase() in TOOL_VERBS);
  const verb = verbIndex >= 0 ? tokens[verbIndex].toLowerCase() : null;
  const object = (verb ? tokens.slice(verbIndex + 1) : tokens).join(" ");
  const [past, progressive] = verb ? TOOL_VERBS[verb] : ["Called", "Calling"];

  const args = visibleToolArguments(toolCall.arguments);
  const detailKey = DETAIL_KEYS.find(
    (key) => typeof args[key] === "string" && String(args[key]).trim()
  );
  const detail = detailKey
    ? `“${truncate(String(args[detailKey]))}”`
    : typeof args.limit === "number"
      ? `limit ${args.limit}`
      : "";

  return {
    verb: toolCall.result ? past : progressive,
    object,
    detail,
    groupKey: verb ? `${past.toLowerCase()} ${object}` : toolCall.name,
  };
}

function formatSeconds(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function toSteps(parts: ChatMessagePart[]): Step[] {
  const steps: Step[] = [];
  parts.forEach((part, index) => {
    const last = steps[steps.length - 1];
    if (part.type === "tool") {
      if (last?.kind === "tools") last.tools.push(part.toolCall);
      else steps.push({ kind: "tools", tools: [part.toolCall] });
    } else if (part.type === "thinking") {
      steps.push({ kind: "thinking", part });
    } else if (part.text.trim()) {
      steps.push({ kind: "text", text: part.text, index });
    }
  });
  return steps;
}

function ShimmerText({ children }: { children: ReactNode }) {
  return <span className="text-shimmer motion-reduce:animate-none">{children}</span>;
}

function ThinkingStep({
  part,
  streaming,
}: {
  part: Extract<ChatMessagePart, { type: "thinking" }>;
  streaming: boolean;
}) {
  const open = part.endedAt === undefined && streaming;
  const text = part.text.trim();
  const label = open ? (
    <ShimmerText>{text ? "Thinking" : "Planning next moves"}</ShimmerText>
  ) : (
    <>
      <span className="text-foreground/70">Thought</span>
      {part.endedAt !== undefined && part.endedAt > part.startedAt && (
        <span className="ml-1">{formatSeconds(part.endedAt - part.startedAt)}</span>
      )}
    </>
  );

  if (!text)
    return (
      <TraceLine>
        <TraceTitle>{label}</TraceTitle>
      </TraceLine>
    );

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger className="w-fit">
        <TraceLine>
          <TraceTitle>{label}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="mt-1 pl-0 text-sm whitespace-pre-wrap">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function ToolRow({ toolCall }: { toolCall: ToolCall }) {
  const { verb, object, detail } = describeToolCall(toolCall);
  const running = !toolCall.result;
  const failed = toolCall.result?.success === false;
  const args = JSON.stringify(visibleToolArguments(toolCall.arguments));

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger className="w-fit max-w-full" disabled={running}>
        <TraceLine status={failed ? "error" : undefined}>
          <TraceTitle>
            {running ? (
              <ShimmerText>
                {verb} {object} {detail}
              </ShimmerText>
            ) : (
              <>
                <span className={cn(!failed && "text-foreground/70")}>{verb}</span>{" "}
                {object} {detail}
                {failed && " · failed"}
              </>
            )}
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="mt-1.5 pl-0">
        {toolCall.reasoning && (
          <p className="text-sm whitespace-pre-wrap">{toolCall.reasoning}</p>
        )}
        <div className="overflow-hidden rounded-md border border-border bg-muted/30">
          <div className="truncate border-b border-border px-3 py-1.5 font-mono text-xs">
            <span className="text-muted-foreground">$ </span>
            <span className="text-foreground/80">{toolCall.name}</span>
            <span className="text-muted-foreground"> {args}</span>
          </div>
          <ToolCallCode
            value={formatToolCallResult(toolCall.result)}
            copyLabel="Result copied to clipboard"
            className="max-h-64 overflow-y-auto"
          />
        </div>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function ToolGroup({ tools }: { tools: ToolCall[] }) {
  if (tools.length === 1) return <ToolRow toolCall={tools[0]} />;

  const running = tools.filter((tool) => !tool.result);
  const counts = new Map<string, number>();
  for (const tool of tools) {
    const { groupKey } = describeToolCall({ ...tool, result: tool.result ?? { success: true } });
    counts.set(groupKey, (counts.get(groupKey) ?? 0) + 1);
  }
  const summary = [...counts]
    .map(([key, count]) => (count > 1 ? `${key} ×${count}` : key))
    .join(", ");
  const current = running[0] ? describeToolCall(running[0]) : null;

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger className="w-fit max-w-full">
        <TraceLine>
          <TraceTitle>
            {running.length > 0 ? (
              <ShimmerText>Running {tools.length} tools</ShimmerText>
            ) : (
              <span className="text-foreground/70">Ran {tools.length} tools</span>
            )}
            <span className="ml-1.5">{summary}</span>
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      {current && (
        <p className="mt-1 text-sm font-light text-muted-foreground">
          <ShimmerText>
            {current.verb} {current.object} {current.detail}
          </ShimmerText>
        </p>
      )}
      <TraceCollapsibleContent className="mt-1.5 space-y-1.5 border-l border-border pl-3">
        {tools.map((tool) => (
          <ToolRow key={tool.id} toolCall={tool} />
        ))}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function StepList({
  steps,
  streaming,
  renderText,
  lastTextIndex,
}: {
  steps: Step[];
  streaming: boolean;
  renderText: ChatMessageTraceProps["renderText"];
  lastTextIndex: number;
}) {
  return (
    <>
      {steps.map((step, i) =>
        step.kind === "thinking" ? (
          <ThinkingStep key={`thinking-${i}`} part={step.part} streaming={streaming} />
        ) : step.kind === "tools" ? (
          <ToolGroup key={`tools-${step.tools[0].id}`} tools={step.tools} />
        ) : (
          renderText(step.text, `text-${step.index}`, step.index === lastTextIndex)
        )
      )}
    </>
  );
}

/**
 * Cursor-style rendering of an assistant reply: thinking and tool steps in
 * muted text, in the order they happened, folded into "Worked for Ns" once
 * the final answer is in.
 */
export function ChatMessageTrace({
  parts,
  streaming,
  startedAt,
  finishedAt,
  renderText,
}: ChatMessageTraceProps) {
  const steps = toSteps(parts);
  const lastTextIndex = parts.reduce(
    (found, part, index) => (part.type === "text" ? index : found),
    -1
  );

  if (streaming && steps.length === 0)
    return (
      <Trace>
        <TraceLine>
          <TraceTitle>
            <ShimmerText>Planning next moves</ShimmerText>
          </TraceTitle>
        </TraceLine>
      </Trace>
    );

  // The answer is the run of text after the last thinking/tool step.
  let answerStart = steps.length;
  while (answerStart > 0 && steps[answerStart - 1].kind === "text") answerStart--;
  const work = steps.slice(0, answerStart);
  const answer = steps.slice(answerStart);
  const hasWork = work.some((step) => step.kind !== "text");

  if (streaming || !hasWork || answer.length === 0)
    return (
      <Trace className="gap-3">
        <StepList
          steps={steps}
          streaming={streaming}
          renderText={renderText}
          lastTextIndex={lastTextIndex}
        />
      </Trace>
    );

  const toolCount = work.reduce(
    (count, step) => count + (step.kind === "tools" ? step.tools.length : 0),
    0
  );
  const workedLabel =
    startedAt && finishedAt
      ? `Worked for ${formatSeconds(finishedAt - startedAt)}`
      : toolCount > 0
        ? `Used ${toolCount} tool${toolCount === 1 ? "" : "s"}`
        : "Thought";

  return (
    <Trace className="gap-3">
      <TraceCollapsible>
        <TraceCollapsibleTrigger className="w-fit">
          <TraceLine>
            <TraceTitle className="text-foreground/70">{workedLabel}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="mt-3 flex flex-col gap-3 pl-0">
          <StepList
            steps={work}
            streaming={false}
            renderText={renderText}
            lastTextIndex={lastTextIndex}
          />
        </TraceCollapsibleContent>
      </TraceCollapsible>
      <StepList
        steps={answer}
        streaming={false}
        renderText={renderText}
        lastTextIndex={lastTextIndex}
      />
    </Trace>
  );
}
