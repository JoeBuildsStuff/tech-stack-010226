import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ChatMessagePart, ChatToolCall } from "@/lib/chat/contracts";
import type { PersistedAttachment, PersistedChatMessage } from "@/lib/chat/conversation-types";

type ChatClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Provider-neutral conversation. Every adapter converts this into its own
 * format, so the full history (attachments, tool calls and results) reaches
 * whichever model answers the turn.
 */
export type AttachmentContent =
  | { kind: "image"; mediaType: string; base64: string }
  | { kind: "pdf"; base64: string }
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "unavailable"; reason: string };

export interface CanonicalAttachment {
  name: string;
  mimeType: string;
  size: number;
  content: AttachmentContent;
}

export type CanonicalMessage =
  | { role: "user"; text: string; attachments: CanonicalAttachment[] }
  | { role: "assistant"; parts: ChatMessagePart[] };

/** One model call's worth of an assistant reply: what it said, then its tool calls. */
export interface AssistantRound {
  text: string;
  toolCalls: ChatToolCall[];
}

/**
 * Split a reply's ordered parts into rounds. A round ends after a run of tool
 * calls, because the model then waited for their results.
 */
export function assistantRounds(parts: ChatMessagePart[]): AssistantRound[] {
  const rounds: AssistantRound[] = [{ text: "", toolCalls: [] }];
  for (const part of parts) {
    let round = rounds[rounds.length - 1];
    if (part.type === "thinking") continue;
    if (part.type === "text") {
      if (round.toolCalls.length) {
        round = { text: "", toolCalls: [] };
        rounds.push(round);
      }
      round.text += part.text;
    } else {
      round.toolCalls.push(part.toolCall);
    }
  }
  return rounds.filter((round) => round.text.trim() || round.toolCalls.length);
}

/** The text a model sees as a tool's result. */
export function toolResultText(call: ChatToolCall) {
  if (!call.result) {
    return call.name === "ask_user"
      ? "The user did not answer these questions and sent a new message instead."
      : "The tool did not return a result.";
  }
  return call.result.success
    ? JSON.stringify(call.result.data ?? null)
    : `Error: ${call.result.error}`;
}

/**
 * A tool call the next model cannot see as a call (a provider-native tool, or
 * a tool not offered on this request), written into the transcript as text.
 */
export function describeToolCallAsText(call: ChatToolCall) {
  return `[Earlier tool call: ${call.name}(${JSON.stringify(call.arguments)}) → ${toolResultText(call)}]`;
}

/** Characters of a text attachment sent to the model. */
const MAX_TEXT_ATTACHMENT_CHARS = 400_000;
const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|bash|sql|ya?ml|toml|ini|env|log|graphql|svg)$/i;
const SUPPORTED_IMAGES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function isTextual(attachment: PersistedAttachment) {
  const type = attachment.mimeType.toLowerCase();
  return (
    type.startsWith("text/") ||
    /(json|xml|javascript|typescript|yaml|x-sh|sql|csv|graphql)/.test(type) ||
    TEXT_EXTENSIONS.test(attachment.name)
  );
}

function bucketFor(mimeType: string) {
  return mimeType.startsWith("image/") ? "chat-images" : "chat-files";
}

async function resolveAttachment(
  client: ChatClient,
  attachment: PersistedAttachment
): Promise<CanonicalAttachment> {
  const base = {
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
  const mimeType = attachment.mimeType === "image/jpg" ? "image/jpeg" : attachment.mimeType;
  const readable =
    SUPPORTED_IMAGES.has(mimeType) ||
    mimeType === "application/pdf" ||
    isTextual(attachment);
  if (!readable)
    return {
      ...base,
      content: {
        kind: "unavailable",
        reason: `${attachment.mimeType || "this file type"} files can't be read yet`,
      },
    };

  const { data, error } = await client.storage
    .from(bucketFor(attachment.mimeType))
    .download(attachment.storagePath);
  if (error || !data)
    return {
      ...base,
      content: {
        kind: "unavailable",
        reason: `the file could not be loaded (${error?.message ?? "missing"})`,
      },
    };

  const bytes = Buffer.from(await data.arrayBuffer());
  if (SUPPORTED_IMAGES.has(mimeType))
    return { ...base, content: { kind: "image", mediaType: mimeType, base64: bytes.toString("base64") } };
  if (mimeType === "application/pdf")
    return { ...base, content: { kind: "pdf", base64: bytes.toString("base64") } };
  const text = bytes.toString("utf8");
  return {
    ...base,
    content: {
      kind: "text",
      text: text.slice(0, MAX_TEXT_ATTACHMENT_CHARS),
      truncated: text.length > MAX_TEXT_ATTACHMENT_CHARS,
    },
  };
}

/**
 * The provider-neutral transcript for a turn: every completed message on the
 * selected path, then the turn's user message. Attachments are loaded from
 * storage so earlier files stay readable on later turns.
 */
export async function buildCanonicalHistory(
  client: ChatClient,
  path: PersistedChatMessage[]
): Promise<CanonicalMessage[]> {
  const cache = new Map<string, Promise<CanonicalAttachment>>();
  const load = (attachment: PersistedAttachment) => {
    let pending = cache.get(attachment.storagePath);
    if (!pending) {
      pending = resolveAttachment(client, attachment);
      cache.set(attachment.storagePath, pending);
    }
    return pending;
  };

  const messages: CanonicalMessage[] = [];
  for (const message of path) {
    if (message.role === "user") {
      messages.push({
        role: "user",
        text: message.content,
        attachments: await Promise.all(message.attachments.map(load)),
      });
    } else if (message.role === "assistant") {
      const parts = message.parts;
      if (parts.length) messages.push({ role: "assistant", parts });
    }
  }
  return messages;
}

/** Label used when an attachment's contents are inlined as text. */
export function attachmentHeading(attachment: CanonicalAttachment) {
  return `Attachment "${attachment.name}" (${attachment.mimeType}, ${attachment.size} bytes)`;
}

/** Fallback text for an attachment a provider cannot take natively. */
export function attachmentAsText(attachment: CanonicalAttachment) {
  const { content } = attachment;
  switch (content.kind) {
    case "text":
      return `${attachmentHeading(attachment)}:\n<file>\n${content.text}\n</file>${content.truncated ? "\n(The file was truncated.)" : ""}`;
    case "unavailable":
      return `${attachmentHeading(attachment)} could not be read: ${content.reason}.`;
    case "image":
      return `${attachmentHeading(attachment)} is an image this model cannot view.`;
    case "pdf":
      return `${attachmentHeading(attachment)} is a PDF this model cannot read.`;
  }
}
