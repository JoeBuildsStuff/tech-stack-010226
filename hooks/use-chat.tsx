"use client";

import { useCallback } from "react";
import { useChatStore } from "@/lib/chat/chat-store";
import type {
  ChatAction,
  ChatMessage,
  ChatMessagePart,
  ChatMessageStatus,
  ChatSettings,
  ChatTurnMode,
  Citation,
  PageContext,
  ReasoningEffort,
  ToolOutput,
} from "@/lib/chat/contracts";
import type { Attachment } from "@/components/chat/chat-input";
import {
  createChatSession,
  getChatConversation,
  selectChatBranch,
  clearChatConversation,
} from "@/actions/chat";
import type {
  PersistedChatMessage,
  ChatConversation,
  PersistedAttachmentInput,
} from "@/lib/chat/conversation-types";
import {
  answerTurn,
  attachTurn,
  cancelTurn,
  startTurn,
} from "@/lib/chat/client/transport";
import type { TurnStreamFrame } from "@/lib/chat/client/stream";
import { applyCitations, applyTurnEvent } from "@/lib/chat/parts";
import {
  abortChatRequest,
  getChatRequest,
  registerChatRequest,
  releaseChatRequest,
  type ChatRequest,
} from "@/lib/chat/client/request-registry";

interface UseChatProps {
  onActionClick?: (action: ChatAction) => void;
}
type AccountSnapshot = { accountId: string; accountEpoch: number };
const loadVersions = new Map<string, number>();
/** The turn each session is watching, so Stop can cancel it on the server. */
const watchedTurns = new Map<string, string>();

const isRunning = (status: ChatMessageStatus | undefined) =>
  status === "pending" || status === "streaming";

function accountSnapshot(): AccountSnapshot {
  const state = useChatStore.getState();
  if (!state.accountId || !state.isAccountReady)
    throw new Error("Sign in before using chat.");
  return { accountId: state.accountId, accountEpoch: state.accountEpoch };
}
function accountIsCurrent(account: AccountSnapshot) {
  const state = useChatStore.getState();
  return (
    state.accountId === account.accountId &&
    state.accountEpoch === account.accountEpoch
  );
}
function assertAccount(account: AccountSnapshot) {
  if (!accountIsCurrent(account))
    throw new DOMException("Chat account changed", "AbortError");
}
function unwrap<T>(result: { data?: T; error?: string }): T {
  if (result.error || result.data === undefined)
    throw new Error(result.error || "Chat operation failed");
  return result.data;
}

export function toChatMessage(message: PersistedChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.createdAt),
    parts: message.role === "assistant" ? message.parts : undefined,
    turnId: message.turnId,
    parentId: message.parentId,
    status: message.status,
    model: message.model,
    settings: message.settings,
    citations: message.citations,
    suggestedActions: message.suggestedActions,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.mimeType,
      size: attachment.size,
      url: attachment.url || undefined,
    })),
  };
}

function applyConversation(
  conversation: ChatConversation,
  account: AccountSnapshot
) {
  assertAccount(account);
  const store = useChatStore.getState();
  const session = conversation.session;
  const messages = conversation.selectedPath.map((message) => {
    const siblingIds = conversation.branches[message.id]?.siblingIds || [
      message.id,
    ];
    const index = siblingIds.indexOf(message.id);
    return {
      ...toChatMessage(message),
      branchInfo: {
        current: index + 1,
        total: siblingIds.length,
        previousId: siblingIds[index - 1],
        nextId: siblingIds[index + 1],
      },
    };
  });
  store.upsertSessionFromServer({
    id: session.id,
    title: session.title,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  });
  // Unlike a summary upsert, canonical empty messages means a persisted clear.
  store.setMessagesForSession(session.id, messages);
}

async function refreshConversation(
  sessionId: string,
  account: AccountSnapshot
) {
  const requestAtStart = useChatStore.getState().loadingBySession[sessionId];
  const versionKey = `${account.accountId}:${account.accountEpoch}:${sessionId}`;
  const version = (loadVersions.get(versionKey) || 0) + 1;
  loadVersions.set(versionKey, version);
  const conversation = unwrap(
    await getChatConversation(sessionId, account.accountId)
  );
  assertAccount(account);
  if (
    loadVersions.get(versionKey) === version &&
    useChatStore.getState().loadingBySession[sessionId] === requestAtStart
  )
    applyConversation(conversation, account);
  return conversation;
}

async function uploadAttachments(
  attachments: Attachment[],
  account: AccountSnapshot,
  signal: AbortSignal
): Promise<PersistedAttachmentInput[]> {
  const uploaded: PersistedAttachmentInput[] = [];
  for (const attachment of attachments) {
    assertAccount(account);
    signal.throwIfAborted();
    const form = new FormData();
    form.set("file", attachment.file);
    form.set("pathPrefix", "chat");
    const response = await fetch(
      attachment.type.startsWith("image/")
        ? "/api/images/upload"
        : "/api/files/upload",
      {
        method: "POST",
        body: form,
        signal,
        headers: { "X-Chat-Account-Id": account.accountId },
      }
    );
    const result = (await response.json()) as {
      error?: string;
      filePath?: string;
    };
    if (!response.ok || result.error || !result.filePath)
      throw new Error(result.error || "Attachment upload failed");
    uploaded.push({
      name: attachment.name,
      mime_type: attachment.type,
      size: attachment.size,
      storage_path: result.filePath,
    });
  }
  return uploaded;
}

/** Live state of the reply a stream is filling in. */
interface ReplyState {
  sessionId: string;
  assistantId: string | null;
  parts: ChatMessagePart[];
  citations: Citation[];
  status: ChatMessageStatus;
}

/**
 * Fold a stream frame into the reply and render it. Only the reply message
 * changes identity, so other messages and controls do not re-render.
 */
function applyFrame(
  frame: TurnStreamFrame,
  reply: ReplyState,
  isCurrent: () => boolean
) {
  const store = useChatStore.getState();
  if (frame.type === "turn") {
    const { turn } = frame;
    reply.assistantId = turn.assistantMessageId;
    watchedTurns.set(reply.sessionId, turn.turnId);
    if (!isCurrent()) return;
    const user = toChatMessage(turn.userMessage);
    store.setMessagesForSession(reply.sessionId, [
      ...turn.history.map(toChatMessage),
      user,
      {
        id: turn.assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        turnId: turn.turnId,
        parentId: user.id,
        status: "pending",
        parts: [],
        settings: turn.settings,
        model: turn.model,
      },
    ]);
    store.setOptimisticMessage(null);
    return;
  }
  if (frame.type === "snapshot") {
    reply.parts = frame.parts;
    reply.citations = frame.citations;
    reply.status = frame.status;
  } else if (frame.type === "event") {
    reply.parts = applyTurnEvent(reply.parts, frame.event);
    reply.citations = applyCitations(reply.citations, frame.event);
    if (reply.status === "pending") reply.status = "streaming";
  } else {
    reply.status = frame.status;
  }
  if (reply.assistantId && isCurrent())
    store.updateMessageInSession(reply.sessionId, reply.assistantId, {
      parts: reply.parts,
      citations: reply.citations,
      status: reply.status,
    });
}

/**
 * Watch a turn's stream in this tab. The request slot makes Stop and the
 * loading state per-session; the server owns the turn itself.
 */
async function watchTurn(
  account: AccountSnapshot,
  sessionId: string,
  reply: ReplyState,
  open: (
    signal: AbortSignal,
    onMessage: (frame: TurnStreamFrame) => void
  ) => Promise<void>,
  options: { reservation?: string; requestId?: string } = {}
) {
  const store = useChatStore.getState();
  const requestId = options.requestId ?? crypto.randomUUID();
  if (!options.reservation && !store.beginRequest(sessionId, requestId))
    throw new Error("This conversation is already processing a request.");
  const request: ChatRequest = {
    ...account,
    sessionId,
    requestId,
    controller: new AbortController(),
  };
  if (!registerChatRequest(request)) {
    store.finishRequest(sessionId, requestId);
    throw new Error("This conversation is already processing a request.");
  }
  const isCurrent = () =>
    accountIsCurrent(account) &&
    useChatStore.getState().isRequestCurrent(sessionId, requestId);
  try {
    await open(request.controller.signal, (frame) =>
      applyFrame(frame, reply, isCurrent)
    );
  } catch (error) {
    if (!request.controller.signal.aborted && accountIsCurrent(account)) throw error;
  } finally {
    releaseChatRequest(request);
    watchedTurns.delete(sessionId);
    if (accountIsCurrent(account)) store.finishRequest(sessionId, requestId);
  }
  if (!accountIsCurrent(account)) return;
  await refreshConversation(sessionId, account);
}

/**
 * Attach to the selected conversation's running turn, if any. Called after a
 * load, so a reply that kept generating while the tab was closed shows up live.
 */
async function attachIfRunning(sessionId: string, account: AccountSnapshot) {
  const state = useChatStore.getState();
  if (state.loadingBySession[sessionId]) return;
  const session = state.sessions.find((item) => item.id === sessionId);
  const running = session?.messages.findLast(
    (message) => message.role === "assistant" && isRunning(message.status)
  );
  if (!running?.turnId) return;
  const turnId = running.turnId;
  watchedTurns.set(sessionId, turnId);
  await watchTurn(
    account,
    sessionId,
    {
      sessionId,
      assistantId: running.id,
      parts: running.parts ?? [],
      citations: running.citations ?? [],
      status: running.status ?? "streaming",
    },
    (signal, onMessage) =>
      attachTurn(turnId, { accountId: account.accountId, signal, onMessage })
  );
}

async function runTurn(input: {
  content: string;
  attachments?: Attachment[];
  model?: string;
  settings?: ChatSettings;
  mode: ChatTurnMode;
  targetMessageId?: string;
}) {
  const account = accountSnapshot();
  const initial = useChatStore.getState();
  let sessionId = initial.currentSessionId;
  const reservation = sessionId || "__new__";
  const requestId = crypto.randomUUID();
  if (!initial.beginRequest(reservation, requestId))
    throw new Error("This conversation is already processing a request.");
  const context: PageContext | null = initial.currentContext
    ? structuredClone(initial.currentContext)
    : null;
  // Render the user's message right away, before the server has
  // acknowledged the turn, so it never appears after the loading spinner.
  if (input.mode === "new") {
    initial.setOptimisticMessage({
      id: "__optimistic__",
      role: "user",
      content: input.content,
      timestamp: new Date(),
      status: "completed",
      attachments: (input.attachments || []).map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        size: attachment.size,
        type: attachment.type,
      })),
    });
  }

  const setup = new AbortController();
  const releaseReservation = () => initial.finishRequest(reservation, requestId);
  let attachments: PersistedAttachmentInput[];
  let shouldTitle = false;
  try {
    if (!sessionId) {
      const session = unwrap(
        await createChatSession({ accountId: account.accountId })
      );
      assertAccount(account);
      sessionId = String(session.id);
      initial.upsertSessionFromServer({
        id: session.id,
        title: session.title,
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at),
        messages: [],
      });
      if (useChatStore.getState().currentSessionId === null)
        initial.setCurrentSessionIdFromServer(sessionId);
    }
    shouldTitle =
      input.mode === "new" &&
      !useChatStore
        .getState()
        .sessions.find((session) => session.id === sessionId)
        ?.messages.some((message) => message.role === "user");
    attachments = await uploadAttachments(
      input.attachments || [],
      account,
      setup.signal
    );
    assertAccount(account);
  } catch (error) {
    releaseReservation();
    if (useChatStore.getState().optimisticMessage?.id === "__optimistic__")
      initial.setOptimisticMessage(null);
    throw error;
  }

  // Move the request slot from the "new chat" reservation to the session.
  releaseReservation();
  const turnSessionId = sessionId;
  const turnId = requestId;
  if (!initial.beginRequest(turnSessionId, requestId))
    throw new Error("This conversation is already processing a request.");
  watchedTurns.set(turnSessionId, turnId);
  try {
    await watchTurn(
      account,
      turnSessionId,
      {
        sessionId: turnSessionId,
        assistantId: null,
        parts: [],
        citations: [],
        status: "pending",
      },
      (signal, onMessage) =>
        startTurn({
          accountId: account.accountId,
          signal,
          onMessage,
          sessionId: turnSessionId,
          turnId,
          mode: input.mode,
          content: input.content,
          targetMessageId: input.targetMessageId,
          model: input.model,
          settings: input.settings,
          attachments,
          context,
        }),
      { reservation: turnSessionId, requestId }
    );
  } finally {
    if (useChatStore.getState().optimisticMessage?.id === "__optimistic__")
      initial.setOptimisticMessage(null);
  }

  if (shouldTitle && input.content.trim() && accountIsCurrent(account)) {
    void fetch("/api/chat/title", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Chat-Account-Id": account.accountId,
      },
      body: JSON.stringify({ sessionId: turnSessionId, message: input.content }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as { title?: string };
        if (result.title && accountIsCurrent(account))
          useChatStore.getState().updateSessionTitle(turnSessionId, result.title);
      })
      .catch(() => {});
  }
}

async function mutateConversation(
  mutation: (sessionId: string, accountId: string) => Promise<{ error?: string }>
) {
  const account = accountSnapshot();
  const state = useChatStore.getState();
  const sessionId = state.currentSessionId;
  if (!sessionId) return;
  const requestId = crypto.randomUUID();
  if (!state.beginRequest(sessionId, requestId))
    throw new Error(
      "Wait for this response to finish before changing the conversation."
    );
  try {
    const result = await mutation(sessionId, account.accountId);
    if (result.error) throw new Error(result.error);
    assertAccount(account);
    await refreshConversation(sessionId, account);
  } finally {
    if (accountIsCurrent(account)) state.finishRequest(sessionId, requestId);
  }
}

// ─── Public actions (stable; they subscribe to nothing) ─────────────────────

async function loadConversation(
  sessionId: string,
  options?: { select?: boolean }
) {
  const account = accountSnapshot();
  const store = useChatStore.getState();
  if (options?.select !== false) store.setCurrentSessionIdFromServer(sessionId);
  // An active stream already owns this session's view; loading a pending DB row
  // over it would discard the text received since the request began.
  if (store.loadingBySession[sessionId]) return;
  await refreshConversation(sessionId, account);
  await attachIfRunning(sessionId, account);
}

async function sendMessage(
  content: string,
  attachments?: Attachment[],
  model?: string,
  reasoningEffort?: ReasoningEffort,
  options?: { webSearchEnabled?: boolean }
) {
  if (!content.trim() && !attachments?.length) return;
  await runTurn({
    content: content.trim() || "Sent with attachments",
    attachments,
    model: model || "gpt-6-astra",
    settings: {
      reasoningEffort: reasoningEffort ?? null,
      webSearchEnabled: options?.webSearchEnabled ?? true,
    },
    mode: "new",
  });
}

const retryMessage = (messageId: string) =>
  runTurn({ content: "", mode: "retry", targetMessageId: messageId });

const editMessage = (messageId: string, content: string) =>
  runTurn({ content, mode: "edit", targetMessageId: messageId });

/**
 * Stop the selected conversation's reply. The server records the stop and
 * ends the stream, so the transcript refreshes with what had streamed.
 */
async function stopMessage() {
  const { accountId, currentSessionId } = useChatStore.getState();
  if (!accountId) return;
  const sessionId = currentSessionId || "__new__";
  // A reply waiting on ask_user has no stream open, but can still be stopped.
  const turnId =
    watchedTurns.get(sessionId) ??
    useChatStore
      .getState()
      .messages.findLast(
        (message) =>
          message.role === "assistant" &&
          (isRunning(message.status) || message.status === "awaiting_input")
      )?.turnId;
  // Nothing started on the server yet (still creating the chat or uploading).
  if (!turnId) return abortChatRequest(accountId, sessionId);
  const request = getChatRequest(accountId, sessionId);
  try {
    await cancelTurn(turnId, accountId);
    if (!request && currentSessionId)
      await refreshConversation(currentSessionId, accountSnapshot());
  } finally {
    // Stop watching even if the stream does not close promptly, but never
    // abort a newer request started in the meantime.
    setTimeout(() => {
      if (request && getChatRequest(accountId, sessionId) === request)
        request.controller.abort();
    }, 3000);
  }
}

/** Answer the model's ask_user questions; the same reply continues. */
async function answerQuestion(
  message: ChatMessage,
  toolCallId: string,
  output: ToolOutput<"ask_user">
) {
  const account = accountSnapshot();
  const sessionId = useChatStore.getState().currentSessionId;
  if (!sessionId || !message.turnId) throw new Error("This question has expired.");
  const turnId = message.turnId;
  watchedTurns.set(sessionId, turnId);
  await watchTurn(
    account,
    sessionId,
    {
      sessionId,
      assistantId: message.id,
      parts: message.parts ?? [],
      citations: message.citations ?? [],
      status: "streaming",
    },
    (signal, onMessage) =>
      answerTurn(
        turnId,
        { toolCallId, output },
        { accountId: account.accountId, signal, onMessage }
      )
  );
}

const clearConversation = () =>
  mutateConversation((sessionId, accountId) =>
    clearChatConversation(sessionId, accountId)
  );

const selectBranch = (leafMessageId: string) =>
  mutateConversation((sessionId, accountId) =>
    selectChatBranch(sessionId, leafMessageId, accountId)
  );

export const chatActions = {
  loadConversation,
  sendMessage,
  retryMessage,
  editMessage,
  stopMessage,
  answerQuestion,
  clearConversation,
  selectBranch,
};

/**
 * Chat actions plus the selected conversation's loading flag. The flag only
 * changes when a request starts or ends, never per streamed token.
 */
export function useChat({ onActionClick }: UseChatProps = {}) {
  const isLoading = useChatStore((state) => state.isLoading);
  const handleActionClick = useCallback(
    (action: ChatAction) => onActionClick?.(action),
    [onActionClick]
  );
  return { ...chatActions, isLoading, handleActionClick };
}
