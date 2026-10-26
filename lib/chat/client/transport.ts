import type {
  ChatSettings,
  ChatTurnMode,
  PageContext,
  ToolOutput,
} from "@/lib/chat/contracts";
import type { PersistedAttachmentInput } from "@/lib/chat/conversation-types";
import { readTurnStream, type TurnStreamFrame } from "./stream";

interface StreamOptions {
  accountId: string;
  signal: AbortSignal;
  onMessage: (message: TurnStreamFrame) => void;
}

export interface StartTurnOptions extends StreamOptions {
  sessionId: string;
  turnId: string;
  mode: ChatTurnMode;
  content: string;
  targetMessageId?: string;
  model?: string;
  settings?: ChatSettings;
  attachments: PersistedAttachmentInput[];
  context: PageContext | null;
}

async function failureMessage(response: Response) {
  const result = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
  } | null;
  return result?.message || result?.error || `Chat request failed (${response.status})`;
}

async function stream(url: string, init: RequestInit, options: StreamOptions) {
  const response = await fetch(url, {
    ...init,
    signal: options.signal,
    headers: {
      ...init.headers,
      "X-Chat-Account-Id": options.accountId,
    },
  });
  if (!response.ok) throw new Error(await failureMessage(response));
  await readTurnStream(response, options.onMessage, options.signal);
}

function clientRequest() {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  const abs = Math.abs(offsetMinutes);
  return {
    clientTz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    clientUtcOffset: `${offsetMinutes <= 0 ? "+" : "-"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`,
    clientNowIso: now.toISOString(),
    clientPath: window.location.pathname,
  };
}

/**
 * Begin a turn. The server reads history itself and keeps generating if this
 * stream closes; the stream only lets this tab watch it.
 */
export function startTurn(options: StartTurnOptions) {
  return stream(
    "/api/chat/turns",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: options.sessionId,
        turnId: options.turnId,
        mode: options.mode,
        content: options.content,
        targetMessageId: options.targetMessageId,
        model: options.model,
        settings: options.settings,
        attachments: options.attachments,
        context: options.context,
        request: clientRequest(),
      }),
    },
    options
  );
}

/** Watch a turn that is already running (another tab, a reload, a reconnect). */
export function attachTurn(turnId: string, options: StreamOptions) {
  return stream(
    `/api/chat/turns/${encodeURIComponent(turnId)}/stream`,
    { method: "GET" },
    options
  );
}

/** Answer ask_user; the server continues the same reply and streams it. */
export function answerTurn(
  turnId: string,
  answer: { toolCallId: string; output: ToolOutput<"ask_user"> },
  options: StreamOptions
) {
  return stream(
    `/api/chat/turns/${encodeURIComponent(turnId)}/answer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answer),
    },
    options
  );
}

/** Stop a turn on the server. Closing a stream alone does not stop it. */
export async function cancelTurn(turnId: string, accountId: string) {
  const response = await fetch(
    `/api/chat/turns/${encodeURIComponent(turnId)}/cancel`,
    { method: "POST", headers: { "X-Chat-Account-Id": accountId } }
  );
  if (!response.ok) throw new Error(await failureMessage(response));
}
