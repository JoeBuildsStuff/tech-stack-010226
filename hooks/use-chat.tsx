"use client";

import { useCallback, useMemo } from "react";
import { useChatStore } from "@/lib/chat/chat-store";
import type { ChatMessage, ChatAction, PageContext } from "@/types/chat";
import type { Json } from "@/types/supabase";
import type { Attachment } from "@/components/chat/chat-input";
import {
  createChatSession,
  beginChatTurn,
  completeChatTurn,
  failChatTurn,
  getChatConversation,
  selectChatBranch,
  clearChatConversation,
} from "@/actions/chat";
import type {
  PersistedChatMessage,
  ChatConversation,
} from "@/lib/chat/conversation-types";
import { sendChatRequest } from "@/lib/chat/client/transport";
import type { StreamToolCall } from "@/lib/chat/client/stream";
import {
  abortChatRequest,
  registerChatRequest,
  releaseChatRequest,
  type ChatRequest,
} from "@/lib/chat/client/request-registry";

interface UseChatProps {
  onActionClick?: (action: ChatAction) => void;
}
type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
type AccountSnapshot = { accountId: string; accountEpoch: number };
const loadVersions = new Map<string, number>();

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
    parentId: message.parentId,
    status: message.status,
    model: message.model,
    settings: message.settings,
    reasoning: message.reasoning || undefined,
    context: message.context as ChatMessage["context"],
    functionResult: (message.functionResult ||
      undefined) as ChatMessage["functionResult"],
    citations: (message.citations || undefined) as ChatMessage["citations"],
    toolCalls: message.toolCalls as unknown as ChatMessage["toolCalls"],
    suggestedActions:
      message.suggestedActions as unknown as ChatMessage["suggestedActions"],
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
) {
  const uploaded = [];
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

export function useChat({ onActionClick }: UseChatProps = {}) {
  const messages = useChatStore((state) => state.messages);
  const isOpen = useChatStore((state) => state.isOpen);
  const isMinimized = useChatStore((state) => state.isMinimized);
  const isLoading = useChatStore((state) => state.isLoading);
  const currentContext = useChatStore((state) => state.currentContext);

  const loadConversation = useCallback(
    async (sessionId: string, options?: { select?: boolean }) => {
      const account = accountSnapshot();
      const store = useChatStore.getState();
      if (options?.select !== false)
        store.setCurrentSessionIdFromServer(sessionId);
      // An active stream already owns this session's view; loading a pending DB row
      // over it would discard the text received since the request began.
      if (store.loadingBySession[sessionId]) return;
      await refreshConversation(sessionId, account);
    },
    []
  );

  const runTurn = useCallback(
    async (input: {
      content: string;
      attachments?: Attachment[];
      model?: string;
      reasoningEffort?: ReasoningEffort;
      webSearchEnabled?: boolean;
      mode: "new" | "edit" | "retry";
      targetMessageId?: string;
    }) => {
      const account = accountSnapshot();
      const initial = useChatStore.getState();
      let sessionId = initial.currentSessionId;
      const reservation = sessionId || "__new__";
      const requestId = crypto.randomUUID();
      if (!initial.beginRequest(reservation, requestId))
        throw new Error("This conversation is already processing a request.");
      const request: ChatRequest = {
        ...account,
        sessionId: reservation,
        requestId,
        controller: new AbortController(),
      };
      if (!registerChatRequest(request)) {
        initial.finishRequest(reservation, requestId);
        throw new Error("This conversation is already processing a request.");
      }
      const { signal } = request.controller;
      const context: PageContext | null = initial.currentContext
        ? structuredClone(initial.currentContext)
        : null;
      const clientPath = window.location.pathname;
      let begun:
        | { sessionId: string; turnId: string; assistantMessageId: string }
        | undefined;
      let completed = false;
      try {
        if (!sessionId) {
          const session = unwrap(
            await createChatSession({ accountId: account.accountId })
          );
          assertAccount(account);
          signal.throwIfAborted();
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
          releaseChatRequest(request);
          initial.finishRequest(reservation, requestId);
          request.sessionId = sessionId;
          if (
            !initial.beginRequest(sessionId, requestId) ||
            !registerChatRequest(request)
          )
            throw new Error(
              "This conversation is already processing a request."
            );
        }
        if (!sessionId) throw new Error("Unable to create chat session");
        if (
          !useChatStore
            .getState()
            .sessions.some((session) => session.id === sessionId)
        )
          await refreshConversation(sessionId, account);
        const shouldTitle =
          input.mode === "new" &&
          !initial.sessions
            .find((session) => session.id === sessionId)
            ?.messages.some((message) => message.role === "user");
        const attachments = await uploadAttachments(
          input.attachments || [],
          account,
          signal
        );
        assertAccount(account);
        signal.throwIfAborted();
        const turn = unwrap(
          await beginChatTurn({
            sessionId,
            accountId: account.accountId,
            turnId: requestId,
            mode: input.mode,
            targetMessageId: input.targetMessageId,
            content: input.content,
            attachments,
            context: context as Json,
            model:
              input.mode === "new" ? input.model || "gpt-5.6-terra" : undefined,
            settings:
              input.mode === "new"
                ? {
                    reasoningEffort: input.reasoningEffort,
                    webSearchEnabled: input.webSearchEnabled ?? true,
                  }
                : undefined,
          })
        );
        begun = turn;
        assertAccount(account);
        signal.throwIfAborted();
        const history = turn.history.map(toChatMessage);
        const user = toChatMessage(turn.userMessage);
        const assistant: ChatMessage = {
          id: turn.assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          parentId: user.id,
          status: "pending",
        };
        initial.setMessagesForSession(sessionId, [...history, user, assistant]);
        let content = "";
        const toolCalls: StreamToolCall[] = [];
        const update = (updates: Partial<ChatMessage>) => {
          if (
            accountIsCurrent(account) &&
            initial.isRequestCurrent(sessionId!, requestId)
          )
            initial.updateMessageInSession(sessionId!, assistant.id, updates);
        };
        const result = await sendChatRequest({
          accountId: account.accountId,
          message: user.content,
          history,
          context,
          clientPath,
          model: turn.model || "gpt-5.6-terra",
          reasoningEffort: turn.settings?.reasoningEffort as
            | ReasoningEffort
            | undefined,
          webSearchEnabled: turn.settings?.webSearchEnabled ?? true,
          attachments: turn.userMessage.attachments.map((attachment) => ({
            name: attachment.name,
            type: attachment.mimeType,
            size: attachment.size,
            url: attachment.url || undefined,
            file: input.attachments?.find(
              (file) =>
                file.name === attachment.name && file.size === attachment.size
            )?.file,
          })),
          signal,
          onDelta: (delta) => {
            content += delta;
            update({ content });
          },
          handlers: {
            onToolCall: (tool) => {
              toolCalls.push(tool);
              update({ toolCalls: toolCalls.map((item) => ({ ...item })) });
            },
            onToolResult: ({ id, result }) => {
              const tool = toolCalls.find((item) => item.id === id);
              if (tool) tool.result = result;
              update({ toolCalls: toolCalls.map((item) => ({ ...item })) });
            },
          },
        });
        assertAccount(account);
        signal.throwIfAborted();
        unwrap(
          await completeChatTurn({
            sessionId,
            turnId: turn.turnId,
            assistantMessageId: assistant.id,
            accountId: account.accountId,
            content: result.message || content,
            reasoning: result.reasoning,
            functionResult: result.functionResult as Json,
            citations: result.citations as Json,
            toolCalls: result.toolCalls as unknown as Json[],
            suggestedActions: result.actions as unknown as Json[],
          })
        );
        completed = true;
        assertAccount(account);
        await refreshConversation(sessionId, account);
        if (shouldTitle && user.content.trim()) {
          void fetch("/api/chat/title", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Chat-Account-Id": account.accountId,
            },
            body: JSON.stringify({ sessionId, message: user.content }),
          })
            .then(async (response) => {
              if (!response.ok) return;
              const result = (await response.json()) as { title?: string };
              if (result.title && accountIsCurrent(account))
                initial.updateSessionTitle(sessionId!, result.title);
            })
            .catch(() => {});
        }
      } catch (error) {
        if (begun && !completed && accountIsCurrent(account)) {
          unwrap(
            await failChatTurn({
              ...begun,
              accountId: account.accountId,
              status: signal.aborted ? "cancelled" : "failed",
              error: signal.aborted
                ? "Response stopped"
                : error instanceof Error
                  ? error.message
                  : "Chat request failed",
            })
          );
          await refreshConversation(begun.sessionId, account);
        }
        if (!signal.aborted && accountIsCurrent(account)) throw error;
      } finally {
        releaseChatRequest(request);
        if (accountIsCurrent(account)) {
          initial.finishRequest(request.sessionId, requestId);
          initial.finishRequest(reservation, requestId);
        }
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      model?: string,
      reasoningEffort?: ReasoningEffort,
      options?: { skipUserAdd?: boolean; webSearchEnabled?: boolean }
    ) => {
      if (!content.trim() && !attachments?.length) return;
      await runTurn({
        content: content.trim() || "Sent with attachments",
        attachments,
        model,
        reasoningEffort,
        webSearchEnabled: options?.webSearchEnabled,
        mode: "new",
      });
    },
    [runTurn]
  );
  const retryMessage = useCallback(
    (messageId: string) =>
      runTurn({ content: "", mode: "retry", targetMessageId: messageId }),
    [runTurn]
  );
  const editMessage = useCallback(
    (messageId: string, content: string) =>
      runTurn({ content, mode: "edit", targetMessageId: messageId }),
    [runTurn]
  );
  const stopMessage = useCallback(() => {
    const { accountId, currentSessionId } = useChatStore.getState();
    if (accountId) abortChatRequest(accountId, currentSessionId || "__new__");
  }, []);

  const mutateConversation = useCallback(
    async (
      mutation: (
        sessionId: string,
        accountId: string
      ) => Promise<{ error?: string }>
    ) => {
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
        if (accountIsCurrent(account))
          state.finishRequest(sessionId, requestId);
      }
    },
    []
  );
  const clearConversation = useCallback(
    () =>
      mutateConversation((sessionId, accountId) =>
        clearChatConversation(sessionId, accountId)
      ),
    [mutateConversation]
  );
  const selectBranch = useCallback(
    (leafMessageId: string) =>
      mutateConversation((sessionId, accountId) =>
        selectChatBranch(sessionId, leafMessageId, accountId)
      ),
    [mutateConversation]
  );
  const handleActionClick = useCallback(
    (action: ChatAction) => onActionClick?.(action),
    [onActionClick]
  );
  const chatState = useMemo(
    () => ({
      isEmpty: !messages.length,
      hasMessages: !!messages.length,
      lastMessage: messages.at(-1) || null,
      messageCount: messages.length,
      isTyping: isLoading,
    }),
    [messages, isLoading]
  );

  return {
    messages,
    isOpen,
    isMinimized,
    isLoading,
    currentContext,
    chatState,
    sendMessage,
    stopMessage,
    retryMessage,
    editMessage,
    clearConversation,
    selectBranch,
    loadConversation,
    handleActionClick,
  };
}
