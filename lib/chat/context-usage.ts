/**
 * Context-window estimates shared by the server (what the next request will
 * send) and the composer (what the draft adds). Counts are approximations,
 * not provider tokenizer output, and are shown with a "~".
 */

export type ContextCategoryId =
  | "system"
  | "tools"
  | "messages"
  | "toolResults"
  | "attachments"
  | "draft";

export interface ContextCategory {
  id: ContextCategoryId;
  label: string;
  tokens: number;
}

export interface ContextUsage {
  model: string;
  contextWindow: number;
  categories: ContextCategory[];
}

export const CONTEXT_CATEGORY_LABELS: Record<ContextCategoryId, string> = {
  system: "System prompt",
  tools: "Tool definitions",
  messages: "Messages",
  toolResults: "Tool calls & results",
  attachments: "Attachments",
  draft: "Draft",
};

/**
 * Context window per model, in tokens. Prefix matches; first match wins.
 * Update these when a provider changes a model's limit.
 */
const CONTEXT_WINDOWS: Array<[prefix: string, tokens: number]> = [
  ["gpt-oss-120b", 131_072],
  ["gpt-6", 400_000],
  ["gpt-5", 400_000],
  ["grok-", 256_000],
  ["claude-", 200_000],
];
const DEFAULT_CONTEXT_WINDOW = 128_000;

export function contextWindowFor(model: string) {
  return (
    CONTEXT_WINDOWS.find(([prefix]) => model.startsWith(prefix))?.[1] ??
    DEFAULT_CONTEXT_WINDOW
  );
}

/** About four characters per token for English text and JSON. */
export function estimateTextTokens(text: string) {
  return Math.ceil(text.length / 4);
}

const IMAGE_TOKENS = 1_600;
/** Roughly what an unreadable-file notice costs. */
const NOTICE_TOKENS = 30;
/** Matches the server's per-file cap for inlined text. */
const MAX_TEXT_ATTACHMENT_CHARS = 400_000;
const TEXT_TYPES = /^text\/|json|xml|javascript|typescript|yaml|x-sh|sql|csv|graphql/;
const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|bash|sql|ya?ml|toml|ini|env|log|graphql|svg)$/i;

/** Estimate an attachment from its metadata, without reading the file. */
export function estimateAttachmentTokens(attachment: {
  name: string;
  type: string;
  size: number;
}) {
  const type = attachment.type.toLowerCase();
  if (/^image\/(jpe?g|png|gif|webp)$/.test(type)) return IMAGE_TOKENS;
  // PDFs are read page by page as text plus an image; ~1 token per 50 bytes.
  if (type === "application/pdf") return Math.max(IMAGE_TOKENS, Math.ceil(attachment.size / 50));
  if (TEXT_TYPES.test(type) || TEXT_EXTENSIONS.test(attachment.name))
    return Math.ceil(Math.min(attachment.size, MAX_TEXT_ATTACHMENT_CHARS) / 4);
  return NOTICE_TOKENS;
}

export function totalTokens(usage: Pick<ContextUsage, "categories">) {
  return usage.categories.reduce((sum, category) => sum + category.tokens, 0);
}

/** 21700 → "21.7K", 1200000 → "1.2M". */
export function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${trimZero(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trimZero(tokens / 1_000)}K`;
  return String(tokens);
}

function trimZero(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}
