"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/chat/chat-store";
import {
  CONTEXT_CATEGORY_LABELS,
  contextWindowFor,
  estimateAttachmentTokens,
  estimateTextTokens,
  formatTokens,
  totalTokens,
  type ContextCategory,
  type ContextCategoryId,
  type ContextUsage,
} from "@/lib/chat/context-usage";

const CATEGORY_COLORS: Record<ContextCategoryId, string> = {
  system: "bg-muted-foreground",
  tools: "bg-chart-1",
  messages: "bg-chart-2",
  toolResults: "bg-chart-4",
  attachments: "bg-chart-3",
  draft: "bg-chart-5",
};

interface ChatContextUsageProps {
  model: string;
  modelLabel: string;
  webSearchEnabled: boolean;
  draft: string;
  draftAttachments: Array<{ name: string; type: string; size: number }>;
}

/**
 * How full the selected model's context window would be with the next
 * message: a ring in the composer that opens a breakdown by category.
 */
export function ChatContextUsage({
  model,
  modelLabel,
  webSearchEnabled,
  draft,
  draftAttachments,
}: ChatContextUsageProps) {
  const usage = useServerUsage(model, webSearchEnabled);
  const draftTokens =
    estimateTextTokens(draft) +
    draftAttachments.reduce((sum, file) => sum + estimateAttachmentTokens(file), 0);

  const categories: ContextCategory[] = [
    ...(usage?.categories ?? []),
    ...(draftTokens
      ? [{ id: "draft" as const, label: CONTEXT_CATEGORY_LABELS.draft, tokens: draftTokens }]
      : []),
  ];
  const contextWindow = usage?.contextWindow ?? contextWindowFor(model);
  const used = totalTokens({ categories });
  const fraction = Math.min(1, used / contextWindow);
  const percent = Math.round(fraction * 100);
  const tone =
    fraction >= 0.9
      ? "text-destructive"
      : fraction >= 0.7
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn("rounded-full", tone)}
          aria-label={`Context ${percent}% full`}
        >
          <UsageRing fraction={fraction} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-80 rounded-2xl p-4 text-sm"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">Context Usage</span>
          <span className="truncate text-xs text-muted-foreground">{modelLabel}</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-2 text-muted-foreground">
          <span>{percent}% Full</span>
          <span className="tabular-nums">
            ~{formatTokens(used)} / {formatTokens(contextWindow)} Tokens
          </span>
        </div>
        <div
          className="mt-2 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${percent}% of the context window used`}
        >
          {categories.map(
            (category) =>
              category.tokens > 0 && (
                <div
                  key={category.id}
                  className={CATEGORY_COLORS[category.id]}
                  style={{ width: `${(category.tokens / contextWindow) * 100}%` }}
                />
              )
          )}
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center gap-2.5">
              <span
                className={cn("size-3 shrink-0 rounded-[3px]", CATEGORY_COLORS[category.id])}
                aria-hidden="true"
              />
              <span className="flex-1">{category.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatTokens(category.tokens)}
              </span>
            </li>
          ))}
          {!usage && (
            <li className="text-xs text-muted-foreground">Calculating conversation…</li>
          )}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Estimated from message length; the provider&apos;s exact count may differ.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function UsageRing({ fraction }: { fraction: number }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] -rotate-90" aria-hidden="true">
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="opacity-25"
      />
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        // Keep a sliver visible so an empty chat still reads as a meter.
        strokeDashoffset={circumference * (1 - Math.max(fraction, 0.02))}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

/**
 * Server estimate for the selected conversation. Refetches when the model,
 * web search or the conversation's messages change, never per token.
 */
function useServerUsage(model: string, webSearchEnabled: boolean) {
  const accountId = useChatStore((state) => state.accountId);
  const sessionId = useChatStore((state) => state.currentSessionId);
  const version = useChatStore((state) =>
    state.messages.map((message) => `${message.id}:${message.status}`).join(",")
  );
  const key = `${accountId}|${sessionId}|${model}|${webSearchEnabled}|${version}`;
  const [result, setResult] = useState<{ key: string; usage: ContextUsage } | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      model,
      webSearch: String(webSearchEnabled),
      path: window.location.pathname,
    });
    if (sessionId) params.set("sessionId", sessionId);
    fetch(`/api/chat/context?${params}`, {
      signal: controller.signal,
      headers: { "X-Chat-Account-Id": accountId },
    })
      .then((response) => (response.ok ? (response.json() as Promise<ContextUsage>) : null))
      .then((usage) => {
        if (usage) setResult({ key, usage });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [accountId, sessionId, model, webSearchEnabled, key]);

  // Show the last estimate while a new one loads, unless the conversation changed.
  return result && result.key.startsWith(`${accountId}|${sessionId}|`) ? result.usage : null;
}
