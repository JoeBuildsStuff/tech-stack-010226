import type { ChatMessage, PageContext } from "@/types/chat";
import { readChatStream, type ChatStreamHandlers } from "./stream";

export interface TransportAttachment {
  name: string;
  type: string;
  size: number;
  file?: File;
  url?: string;
}

export interface ChatTransportOptions {
  accountId: string;
  message: string;
  history: ChatMessage[];
  context: PageContext | null;
  model: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  webSearchEnabled: boolean;
  attachments: TransportAttachment[];
  clientPath: string;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
  handlers?: ChatStreamHandlers;
}

export function chatEndpoint(model: string) {
  if (model.startsWith("gpt-oss-120b")) return "/api/chat/cerebras";
  if (model.startsWith("gpt-5")) return "/api/chat/openai";
  if (model.startsWith("grok-")) return "/api/chat/xai";
  return "/api/chat/anthropic";
}

/** Snapshot passed by the caller is immutable for the lifetime of this request. */
export async function sendChatRequest(options: ChatTransportOptions) {
  const form = new FormData();
  form.set("message", options.message);
  form.set("messages", JSON.stringify(options.history.slice(-10)));
  form.set("context", JSON.stringify(options.context));
  form.set("model", options.model);
  if (options.reasoningEffort)
    form.set("reasoning_effort", options.reasoningEffort);
  form.set("web_search_enabled", String(options.webSearchEnabled));
  form.set("stream", "true");
  form.set("client_path", options.clientPath);
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  const abs = Math.abs(offsetMinutes);
  const offset = `${offsetMinutes <= 0 ? "+" : "-"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  form.set("client_tz", Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  form.set("client_utc_offset", offset);
  form.set("client_now_iso", now.toISOString());

  for (const [index, attachment] of options.attachments.entries()) {
    options.signal.throwIfAborted();
    let file = attachment.file;
    if (!file && attachment.url) {
      const response = await fetch(attachment.url, { signal: options.signal });
      if (!response.ok)
        throw new Error(`Unable to load attachment: ${attachment.name}`);
      file = new File([await response.blob()], attachment.name, {
        type: attachment.type,
      });
    }
    if (!file) throw new Error(`Attachment is unavailable: ${attachment.name}`);
    form.set(`attachment-${index}`, file);
    form.set(`attachment-${index}-name`, attachment.name);
    form.set(`attachment-${index}-type`, attachment.type);
    form.set(`attachment-${index}-size`, String(file.size));
  }
  form.set("attachmentCount", String(options.attachments.length));
  options.signal.throwIfAborted();
  const response = await fetch(chatEndpoint(options.model), {
    method: "POST",
    body: form,
    signal: options.signal,
    headers: { "X-Chat-Account-Id": options.accountId },
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new Error(
      result?.message ||
        result?.error ||
        `Chat request failed (${response.status})`
    );
  }
  return readChatStream(
    response,
    options.onDelta,
    options.signal,
    options.handlers
  );
}
