import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  abortAllChatRequests,
  abortChatRequest,
} from "@/lib/chat/client/request-registry";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  reasoning?: string; // Reasoning associated with this specific tool call
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  /** Durable conversation metadata. Server actions own its lifecycle. */
  parentId?: string | null;
  status?: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  model?: string | null;
  settings?: {
    reasoningEffort?: string | null;
    webSearchEnabled?: boolean;
  };
  branchInfo?: {
    current: number;
    total: number;
    previousId?: string;
    nextId?: string;
  };
  reasoning?: string; // Reasoning steps from Cerebras API
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    url?: string;
    data?: string; // base64 data for images
  }>;
  context?: {
    filters?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
  suggestedActions?: ChatAction[];
  functionResult?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  toolCalls?: ToolCall[];
  citations?: Array<{
    url: string;
    title: string;
    cited_text: string;
  }>;
}

export interface ChatAction {
  type: "filter" | "sort" | "navigate" | "create" | "function_call";
  label: string;
  payload: Record<string, unknown>;
}

export interface PageContext {
  currentFilters: Record<string, unknown>;
  currentSort: Record<string, unknown>;
  visibleData: Record<string, unknown>[];
  totalCount: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  context?: PageContext;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatStore {
  /** The authenticated owner of the in-memory chat state. */
  accountId: string | null;
  /** Monotonically increases whenever the authenticated account changes. */
  accountEpoch: number;
  /** False while auth and account-scoped preferences are being resolved. */
  isAccountReady: boolean;
  /** Zustand persistence hydration has completed. */
  isHydrated: boolean;

  // Session management
  sessions: ChatSession[];
  currentSessionId: string | null;

  // UI State
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  isLoading: boolean;
  /** Active request id per session. A session has at most one active request. */
  loadingBySession: Record<string, string>;
  showHistory: boolean;
  currentContext: PageContext | null;
  layoutMode: "floating" | "inset" | "fullpage";
  lastNonFullpageLayout: "floating" | "inset";
  openSessionIds: string[];

  // Computed properties (will be updated whenever state changes)
  currentSession: ChatSession | null;
  messages: ChatMessage[];
  setAccountPending: () => void;
  setAccount: (accountId: string | null) => void;
  resetForAccount: (accountId: string | null) => void;
  beginRequest: (sessionId: string, requestId: string) => boolean;
  finishRequest: (sessionId: string, requestId: string) => void;
  isRequestCurrent: (
    sessionId: string,
    requestId: string,
    accountEpoch?: number
  ) => boolean;
  isSessionLoading: (sessionId: string) => boolean;

  // Session CRUD operations
  createSession: (title?: string) => string;
  switchToSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  getSessions: () => ChatSessionSummary[];

  // Message CRUD operations (operate on current session)
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;

  // Server-backed helpers
  upsertSessionFromServer: (
    session: Omit<ChatSession, "messages"> & { messages?: ChatMessage[] }
  ) => void;
  setCurrentSessionIdFromServer: (sessionId: string) => void;
  setMessagesForSession: (sessionId: string, messages: ChatMessage[]) => void;
  addMessageToSession: (
    sessionId: string,
    message: Omit<ChatMessage, "id" | "timestamp"> &
      Partial<Pick<ChatMessage, "id" | "timestamp">>
  ) => string | null;
  updateMessageInSession: (
    sessionId: string,
    id: string,
    updates: Partial<ChatMessage>
  ) => void;
  deleteMessageInSession: (sessionId: string, id: string) => void;

  // Message actions
  copyMessage: (messageId: string) => void;
  // Tool call operations
  addToolCalls: (messageId: string, toolCalls: ToolCall[]) => void;
  updateToolCallResult: (
    messageId: string,
    toolCallId: string,
    result: { success: boolean; data?: unknown; error?: string }
  ) => void;

  // UI State
  setOpen: (open: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  setMaximized: (maximized: boolean) => void;
  setLoading: (loading: boolean) => void;
  toggleChat: () => void;
  setShowHistory: (show: boolean) => void;
  setLayoutMode: (mode: "floating" | "inset" | "fullpage") => void;
  openSessionTab: (sessionId: string) => void;
  closeSessionTab: (sessionId: string) => void;

  // Context management
  updatePageContext: (context: PageContext) => void;

  // Quota management
  getStorageUsage: () => {
    totalSize: number;
    sessionsCount: number;
    messagesCount: number;
    attachmentsCount: number;
    attachmentsSize: number;
    usagePercentage: number;
  };
  clearOldSessions: (keepCount?: number) => void;
  isStorageQuotaExceeded: () => boolean;

  // Utility
  getUnreadCount: () => number;
}

// Helper function to compute current session and messages
const computeCurrentSessionAndMessages = (
  sessions: ChatSession[],
  currentSessionId: string | null
) => {
  const currentSession =
    sessions.find((s) => s.id === currentSessionId) || null;
  const messages = currentSession?.messages || [];
  return { currentSession, messages };
};

// Helper function to generate session title
const generateSessionTitle = (messages: ChatMessage[]): string => {
  if (messages.length === 0) return "New Chat";

  const firstUserMessage = messages.find((m) => m.role === "user");
  if (firstUserMessage) {
    // Truncate to 30 characters
    const title = firstUserMessage.content.slice(0, 30);
    return title.length < firstUserMessage.content.length
      ? `${title}...`
      : title;
  }

  return "New Chat";
};

const CHAT_STORAGE_NAME = "chat-storage-v2";
const CHAT_STORAGE_MAX_SIZE = 256 * 1024;

type PersistedChatPreferences = {
  accountId?: string | null;
  currentSessionId?: string | null;
  layoutMode?: "floating" | "inset" | "fullpage";
  lastNonFullpageLayout?: "floating" | "inset";
  openSessionIds?: string[];
};

const accountStorageKey = (accountId: string) =>
  `${CHAT_STORAGE_NAME}:account:${encodeURIComponent(accountId)}`;

const readAccountPreferences = (
  accountId: string
): PersistedChatPreferences | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(accountStorageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: PersistedChatPreferences };
    return parsed.state ?? null;
  } catch {
    return null;
  }
};

const deriveLoading = (
  loadingBySession: Record<string, string>,
  currentSessionId: string | null
) => Boolean(loadingBySession[currentSessionId || "__new__"]);

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // Initial state
      accountId: null,
      accountEpoch: 0,
      isAccountReady: false,
      isHydrated: false,
      sessions: [],
      currentSessionId: null,
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      isLoading: false,
      loadingBySession: {},
      showHistory: false,
      currentContext: null,
      currentSession: null,
      messages: [],
      layoutMode: "floating",
      lastNonFullpageLayout: "floating",
      openSessionIds: [],

      setAccountPending: () => {
        abortAllChatRequests();
        set({
          accountId: null,
          accountEpoch: get().accountEpoch + 1,
          isAccountReady: false,
          sessions: [],
          currentSessionId: null,
          currentSession: null,
          messages: [],
          loadingBySession: {},
          isLoading: false,
          openSessionIds: [],
          currentContext: null,
          isOpen: false,
          isMinimized: false,
          isMaximized: false,
          showHistory: false,
        });
      },

      setAccount: (accountId) => {
        const state = get();
        const changed = state.accountId !== accountId;
        const preferences = accountId
          ? readAccountPreferences(accountId)
          : null;

        if (!changed && state.isAccountReady) return;

        if (changed) abortAllChatRequests();

        set((current) => ({
          accountId,
          accountEpoch: changed
            ? current.accountEpoch + 1
            : current.accountEpoch,
          isAccountReady: current.isHydrated,
          sessions: [],
          currentSessionId: preferences?.currentSessionId ?? null,
          currentSession: null,
          messages: [],
          loadingBySession: {},
          isLoading: false,
          layoutMode: preferences?.layoutMode ?? "floating",
          lastNonFullpageLayout:
            preferences?.lastNonFullpageLayout ?? "floating",
          openSessionIds: preferences?.openSessionIds ?? [],
          currentContext: null,
          isOpen: false,
          isMinimized: false,
          isMaximized: false,
          showHistory: false,
        }));
      },

      resetForAccount: (accountId) => {
        abortAllChatRequests();
        get().setAccount(accountId);
      },

      beginRequest: (sessionId, requestId) => {
        const state = get();
        if (!state.isAccountReady || state.loadingBySession[sessionId])
          return false;
        set((current) => {
          const loadingBySession = {
            ...current.loadingBySession,
            [sessionId]: requestId,
          };
          return {
            loadingBySession,
            isLoading: deriveLoading(
              loadingBySession,
              current.currentSessionId
            ),
          };
        });
        return true;
      },

      finishRequest: (sessionId, requestId) => {
        set((current) => {
          if (current.loadingBySession[sessionId] !== requestId) return current;
          const loadingBySession = { ...current.loadingBySession };
          delete loadingBySession[sessionId];
          return {
            loadingBySession,
            isLoading: deriveLoading(
              loadingBySession,
              current.currentSessionId
            ),
          };
        });
      },

      isRequestCurrent: (sessionId, requestId, accountEpoch) => {
        const state = get();
        return (
          state.isAccountReady &&
          state.loadingBySession[sessionId] === requestId &&
          (accountEpoch === undefined || state.accountEpoch === accountEpoch)
        );
      },

      isSessionLoading: (sessionId) =>
        Boolean(get().loadingBySession[sessionId]),

      // Session CRUD operations
      createSession: (title?: string) => {
        const sessionId = crypto.randomUUID();
        const now = new Date();

        const newSession: ChatSession = {
          id: sessionId,
          title: title || "New Chat",
          messages: [],
          createdAt: now,
          updatedAt: now,
        };

        set((state) => {
          const newSessions = [newSession, ...state.sessions];
          const { currentSession, messages } = computeCurrentSessionAndMessages(
            newSessions,
            sessionId
          );

          return {
            sessions: newSessions,
            currentSessionId: sessionId,
            currentSession,
            messages,
            isLoading: deriveLoading(state.loadingBySession, sessionId),
            showHistory: false,
          };
        });

        return sessionId;
      },

      switchToSession: (sessionId) => {
        set((state) => {
          const { currentSession, messages } = computeCurrentSessionAndMessages(
            state.sessions,
            sessionId
          );

          return {
            currentSessionId: sessionId,
            currentSession,
            messages,
            isLoading: deriveLoading(state.loadingBySession, sessionId),
            showHistory: false,
          };
        });
      },

      deleteSession: (sessionId) => {
        const { accountId } = get();
        if (accountId) abortChatRequest(accountId, sessionId);
        set((state) => {
          const newSessions = state.sessions.filter((s) => s.id !== sessionId);
          const newCurrentId =
            state.currentSessionId === sessionId
              ? newSessions[0]?.id || null
              : state.currentSessionId;

          const { currentSession, messages } = computeCurrentSessionAndMessages(
            newSessions,
            newCurrentId
          );

          const loadingBySession = { ...state.loadingBySession };
          delete loadingBySession[sessionId];
          return {
            sessions: newSessions,
            currentSessionId: newCurrentId,
            currentSession,
            messages,
            isLoading: deriveLoading(loadingBySession, newCurrentId),
            loadingBySession,
            openSessionIds: state.openSessionIds.filter(
              (id) => id !== sessionId
            ),
          };
        });
      },

      updateSessionTitle: (sessionId, title) => {
        set((state) => {
          const updatedSessions = state.sessions.map((s) =>
            s.id === sessionId ? { ...s, title, updatedAt: new Date() } : s
          );

          const { currentSession, messages } = computeCurrentSessionAndMessages(
            updatedSessions,
            state.currentSessionId
          );

          const oldSession = state.sessions.find((s) => s.id === sessionId);
          const titleGenerated =
            oldSession?.title === "New Chat" && title !== "New Chat";
          const openSessionIds =
            titleGenerated && !state.openSessionIds.includes(sessionId)
              ? [...state.openSessionIds, sessionId]
              : state.openSessionIds;

          return {
            sessions: updatedSessions,
            currentSession,
            messages,
            openSessionIds,
          };
        });
      },

      getSessions: () => {
        const { sessions } = get();
        return sessions.map((session) => ({
          id: session.id,
          title: session.title,
          lastMessage:
            session.messages[session.messages.length - 1]?.content || "",
          messageCount: session.messages.length,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        }));
      },

      // Message CRUD operations
      addMessageToSession: (sessionId, messageData) => {
        const state = get();
        if (!state.isAccountReady) return null;

        const message: ChatMessage = {
          ...messageData,
          id: messageData.id ?? crypto.randomUUID(),
          timestamp: messageData.timestamp ?? new Date(),
        };

        set((current) => {
          const exists = current.sessions.some(
            (session) => session.id === sessionId
          );
          if (!exists) return current;
          const sessions = current.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            const messages = [...session.messages, message];
            return {
              ...session,
              messages,
              title:
                session.title === "New Chat"
                  ? generateSessionTitle(messages)
                  : session.title,
              updatedAt: new Date(),
            };
          });
          const { currentSession, messages } = computeCurrentSessionAndMessages(
            sessions,
            current.currentSessionId
          );
          return { sessions, currentSession, messages };
        });
        return message.id;
      },

      updateMessageInSession: (sessionId, id, updates) => {
        set((current) => {
          const sessions = current.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: session.messages.map((message) =>
                    message.id === id ? { ...message, ...updates } : message
                  ),
                  updatedAt: new Date(),
                }
              : session
          );
          const { currentSession, messages } = computeCurrentSessionAndMessages(
            sessions,
            current.currentSessionId
          );
          return { sessions, currentSession, messages };
        });
      },

      deleteMessageInSession: (sessionId, id) => {
        set((current) => {
          const sessions = current.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: session.messages.filter(
                    (message) => message.id !== id
                  ),
                  updatedAt: new Date(),
                }
              : session
          );
          const { currentSession, messages } = computeCurrentSessionAndMessages(
            sessions,
            current.currentSessionId
          );
          return { sessions, currentSession, messages };
        });
      },

      addMessage: (messageData) => {
        if (!get().isAccountReady) return;
        const message: ChatMessage = {
          ...messageData,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        };

        set((state) => {
          // Create a session if none exists
          let currentSessionId = state.currentSessionId;
          let sessions = state.sessions;

          if (
            !currentSessionId ||
            !sessions.find((s) => s.id === currentSessionId)
          ) {
            const sessionId = crypto.randomUUID();
            const now = new Date();

            const newSession: ChatSession = {
              id: sessionId,
              title: "New Chat",
              messages: [],
              createdAt: now,
              updatedAt: now,
            };

            sessions = [newSession, ...sessions];
            currentSessionId = sessionId;
          }

          // Check if adding this message would exceed quota
          const currentUsage = get().getStorageUsage();
          const messageSize = new Blob([JSON.stringify(message)]).size;
          const estimatedNewSize = currentUsage.totalSize + messageSize;
          const maxSize = 10 * 1024 * 1024; // 10MB

          if (estimatedNewSize > maxSize) {
            // Try to clear old sessions to make room
            const sortedSessions = sessions.sort((a, b) => {
              if (a.id === currentSessionId) return -1;
              if (b.id === currentSessionId) return 1;
              return (
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
              );
            });

            // Keep only the 2 most recent sessions
            const sessionsToKeep = sortedSessions.slice(0, 2);
            const sessionsToDelete = sortedSessions.slice(2);

            // Delete old sessions
            sessionsToDelete.forEach((session) => {
              get().deleteSession(session.id);
            });

            // Update sessions to only include kept ones
            sessions = sessionsToKeep;
          }

          // Update the current session with the new message
          const updatedSessions = sessions.map((session) => {
            if (session.id === currentSessionId) {
              const updatedMessages = [...session.messages, message];
              return {
                ...session,
                messages: updatedMessages,
                title:
                  session.title === "New Chat"
                    ? generateSessionTitle(updatedMessages)
                    : session.title,
                updatedAt: new Date(),
              };
            }
            return session;
          });

          const { currentSession, messages } = computeCurrentSessionAndMessages(
            updatedSessions,
            currentSessionId
          );

          return {
            sessions: updatedSessions,
            currentSessionId,
            currentSession,
            messages,
          };
        });
      },

      updateMessage: (id, updates) => {
        set((state) => {
          const updatedSessions = state.sessions.map((session) =>
            session.id === state.currentSessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === id ? { ...msg, ...updates } : msg
                  ),
                  updatedAt: new Date(),
                }
              : session
          );

          const { currentSession, messages } = computeCurrentSessionAndMessages(
            updatedSessions,
            state.currentSessionId
          );

          return {
            sessions: updatedSessions,
            currentSession,
            messages,
          };
        });
      },

      deleteMessage: (id) => {
        set((state) => {
          const updatedSessions = state.sessions.map((session) =>
            session.id === state.currentSessionId
              ? {
                  ...session,
                  messages: session.messages.filter((msg) => msg.id !== id),
                  updatedAt: new Date(),
                }
              : session
          );

          const { currentSession, messages } = computeCurrentSessionAndMessages(
            updatedSessions,
            state.currentSessionId
          );

          return {
            sessions: updatedSessions,
            currentSession,
            messages,
          };
        });
      },

      clearMessages: () => {
        set((state) => {
          const updatedSessions = state.sessions.map((session) =>
            session.id === state.currentSessionId
              ? {
                  ...session,
                  messages: [],
                  updatedAt: new Date(),
                }
              : session
          );

          const { currentSession, messages } = computeCurrentSessionAndMessages(
            updatedSessions,
            state.currentSessionId
          );

          return {
            sessions: updatedSessions,
            currentSession,
            messages,
          };
        });
      },

      // Server-backed helpers
      upsertSessionFromServer: (session) => {
        set((state) => {
          const exists = state.sessions.find((s) => s.id === session.id);
          // Summary hydration intentionally omits messages. Preserve the
          // in-memory transcript in that case, including an optimistic turn
          // that is still being persisted.
          const incomingMessages =
            session.messages && session.messages.length > 0
              ? session.messages
              : (exists?.messages ?? session.messages);
          const toInsert: ChatSession = {
            id: session.id,
            title: session.title,
            messages: incomingMessages ?? exists?.messages ?? [],
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            context: session.context,
          };

          const sessions = exists
            ? state.sessions.map((s) =>
                s.id === session.id ? { ...s, ...toInsert } : s
              )
            : [toInsert, ...state.sessions];

          const nextCurrentSessionId = state.currentSessionId ?? session.id;
          const { currentSession, messages } = computeCurrentSessionAndMessages(
            sessions,
            nextCurrentSessionId
          );

          const oldSession = state.sessions.find((s) => s.id === session.id);
          const titleGenerated =
            oldSession?.title === "New Chat" && session.title !== "New Chat";
          const openSessionIds =
            titleGenerated && !state.openSessionIds.includes(session.id)
              ? [...state.openSessionIds, session.id]
              : state.openSessionIds;

          return {
            sessions,
            currentSessionId: nextCurrentSessionId,
            currentSession,
            messages,
            isLoading: deriveLoading(
              state.loadingBySession,
              nextCurrentSessionId
            ),
            openSessionIds,
          };
        });
      },

      setCurrentSessionIdFromServer: (sessionId) => {
        set((state) => {
          const { currentSession, messages } = computeCurrentSessionAndMessages(
            state.sessions,
            sessionId
          );
          return {
            currentSessionId: sessionId,
            currentSession,
            messages,
            isLoading: deriveLoading(state.loadingBySession, sessionId),
            showHistory: false,
          };
        });
      },

      setMessagesForSession: (sessionId, newMessages) => {
        set((state) => {
          const updatedSessions = state.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, messages: newMessages, updatedAt: new Date() }
              : s
          );
          const { currentSession, messages } = computeCurrentSessionAndMessages(
            updatedSessions,
            state.currentSessionId
          );
          return {
            sessions: updatedSessions,
            currentSession,
            messages,
            isLoading: deriveLoading(
              state.loadingBySession,
              state.currentSessionId
            ),
          };
        });
      },

      copyMessage: (messageId: string) => {
        const state = get();
        const message = state.messages.find((msg) => msg.id === messageId);
        if (message) {
          navigator.clipboard.writeText(message.content).catch(console.error);
        }
      },

      addToolCalls: (messageId: string, toolCalls: ToolCall[]) => {
        set((state) => {
          const updatedSessions = state.sessions.map((session) =>
            session.id === state.currentSessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          toolCalls: [...(msg.toolCalls || []), ...toolCalls],
                          updatedAt: new Date(),
                        }
                      : msg
                  ),
                }
              : session
          );

          const { currentSession, messages } = computeCurrentSessionAndMessages(
            updatedSessions,
            state.currentSessionId
          );

          return {
            sessions: updatedSessions,
            currentSession,
            messages,
          };
        });
      },

      updateToolCallResult: (
        messageId: string,
        toolCallId: string,
        result: { success: boolean; data?: unknown; error?: string }
      ) => {
        set((state) => {
          const updatedSessions = state.sessions.map((session) =>
            session.id === state.currentSessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          toolCalls: msg.toolCalls?.map((tc) =>
                            tc.id === toolCallId ? { ...tc, result } : tc
                          ),
                          updatedAt: new Date(),
                        }
                      : msg
                  ),
                }
              : session
          );

          const { currentSession, messages } = computeCurrentSessionAndMessages(
            updatedSessions,
            state.currentSessionId
          );

          return {
            sessions: updatedSessions,
            currentSession,
            messages,
          };
        });
      },

      // UI State
      setOpen: (open) => {
        set({
          isOpen: open,
          isMinimized: open ? false : get().isMinimized,
          isMaximized: open ? get().isMaximized : false,
        });
      },

      setMinimized: (minimized) => {
        set({
          isMinimized: minimized,
          isOpen: minimized ? false : get().isOpen,
          isMaximized: minimized ? false : get().isMaximized,
        });
      },

      setMaximized: (maximized) => {
        set({
          isMaximized: maximized,
          isOpen: maximized ? true : get().isOpen,
          isMinimized: maximized ? false : get().isMinimized,
        });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      toggleChat: () => {
        const { isOpen, isMaximized } = get();
        if (!isOpen) {
          // Open in normal mode
          set({ isOpen: true, isMinimized: false, isMaximized: false });
        } else if (!isMaximized) {
          // Maximize
          set({ isMaximized: true, isMinimized: false });
        } else {
          // Close
          set({ isOpen: false, isMinimized: false, isMaximized: false });
        }
      },

      setShowHistory: (show) => {
        set({ showHistory: show });
      },

      setLayoutMode: (mode) => {
        set({
          layoutMode: mode,
          lastNonFullpageLayout:
            mode === "fullpage" ? get().lastNonFullpageLayout : mode,
          isMaximized: mode === "inset",
          isMinimized: false,
          isOpen: mode !== "fullpage",
        });
      },

      openSessionTab: (sessionId) => {
        set((state) => {
          if (state.openSessionIds.includes(sessionId)) return state;
          return { openSessionIds: [...state.openSessionIds, sessionId] };
        });
      },

      closeSessionTab: (sessionId) => {
        set((state) => ({
          openSessionIds: state.openSessionIds.filter((id) => id !== sessionId),
        }));
      },

      // Context management
      updatePageContext: (context) => {
        set({ currentContext: context });
      },

      // Quota management
      getStorageUsage: () => {
        const { sessions } = get();

        const totalMessages = sessions.reduce(
          (count, session) => count + session.messages.length,
          0
        );
        const totalAttachments = sessions.reduce(
          (count, session) =>
            count +
            session.messages.reduce(
              (msgCount, msg) => msgCount + (msg.attachments?.length || 0),
              0
            ),
          0
        );
        const totalAttachmentsSize = sessions.reduce(
          (size, session) =>
            size +
            session.messages.reduce(
              (msgSize, msg) =>
                msgSize +
                (msg.attachments?.reduce(
                  (attSize, att) =>
                    attSize + (att.data ? new Blob([att.data]).size : 0),
                  0
                ) || 0),
              0
            ),
          0
        );

        // Calculate total storage size
        const totalSize = new Blob([
          JSON.stringify({
            sessions: sessions,
            currentSessionId: get().currentSessionId,
            layoutMode: get().layoutMode,
          }),
        ]).size;

        const maxStorageSize = 10 * 1024 * 1024; // 10MB
        const usagePercentage = (totalSize / maxStorageSize) * 100;

        return {
          totalSize,
          sessionsCount: sessions.length,
          messagesCount: totalMessages,
          attachmentsCount: totalAttachments,
          attachmentsSize: totalAttachmentsSize,
          usagePercentage,
        };
      },

      clearOldSessions: (keepCount = 3) => {
        const { sessions, currentSessionId } = get();

        // Sort sessions by updatedAt, keeping current session first
        const sortedSessions = sessions.sort((a, b) => {
          if (a.id === currentSessionId) return -1;
          if (b.id === currentSessionId) return 1;
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        });

        // Get sessions to delete (keep the specified number of sessions)
        const sessionsToDelete = sortedSessions.slice(keepCount);

        // Delete old sessions
        sessionsToDelete.forEach((session) => {
          get().deleteSession(session.id);
        });
      },

      isStorageQuotaExceeded: () => {
        const usage = get().getStorageUsage();
        return usage.usagePercentage >= 95; // 95% threshold
      },

      // Utility
      getUnreadCount: () => {
        // For now, return 0. This can be enhanced with read/unread tracking
        return 0;
      },
    }),
    {
      name: CHAT_STORAGE_NAME,
      version: 2,
      storage: createJSONStorage(() => ({
        // Deliberately ignore the old unscoped chat-storage key. It contained
        // transcripts and could belong to another account.
        getItem: () => {
          if (typeof window !== "undefined") {
            // Remove the pre-account-scoped cache instead of ever parsing it.
            window.localStorage.removeItem("chat-storage");
          }
          return null;
        },
        setItem: (name: string, value: string) => {
          if (typeof window === "undefined") return;
          try {
            const parsed = JSON.parse(value) as {
              state?: PersistedChatPreferences;
            };
            const accountId = parsed.state?.accountId;
            if (!accountId || new Blob([value]).size > CHAT_STORAGE_MAX_SIZE)
              return;
            if (
              window.localStorage.getItem(accountStorageKey(accountId)) !==
              value
            ) {
              window.localStorage.setItem(accountStorageKey(accountId), value);
            }
            window.localStorage.removeItem("chat-storage");
          } catch {
            // Storage is an optimization; chat state remains in memory.
          }
        },
        removeItem: (name: string) => {
          if (typeof window !== "undefined")
            window.localStorage.removeItem(name);
        },
      })),
      // Durable transcripts and branch state are server owned. Only compact,
      // account-scoped UI preferences survive a page reload.
      partialize: (state) => ({
        accountId: state.accountId,
        currentSessionId: state.currentSessionId,
        layoutMode: state.layoutMode,
        lastNonFullpageLayout: state.lastNonFullpageLayout,
        openSessionIds: state.openSessionIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.sessions = [];
        state.currentSession = null;
        state.messages = [];
        state.loadingBySession = {};
        state.isLoading = false;
        state.isHydrated = true;
        state.isAccountReady = false;
      },
    }
  )
);
