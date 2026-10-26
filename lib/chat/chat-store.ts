import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  abortAllChatRequests,
  abortChatRequest,
} from "@/lib/chat/client/request-registry";
import type { ChatMessage, PageContext } from "@/lib/chat/contracts";

/**
 * In-memory views of the current account's conversations. The database owns
 * transcripts; every mutation goes through the server and the result is
 * written back here with the *FromServer / *ForSession setters.
 */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  context?: PageContext;
}

export type ChatLayoutMode = "floating" | "inset" | "fullpage";

interface ChatStore {
  /** The authenticated owner of the in-memory chat state. */
  accountId: string | null;
  /** Monotonically increases whenever the authenticated account changes. */
  accountEpoch: number;
  /** False while auth and account-scoped preferences are being resolved. */
  isAccountReady: boolean;
  /** Zustand persistence hydration has completed. */
  isHydrated: boolean;

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
  layoutMode: ChatLayoutMode;
  lastNonFullpageLayout: "floating" | "inset";
  openSessionIds: string[];
  /**
   * A just-sent user message rendered immediately, before the server has
   * acknowledged the turn and the real message lands in `messages`.
   */
  optimisticMessage: ChatMessage | null;

  /** Derived from sessions/currentSessionId on every write. */
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

  deleteSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;

  upsertSessionFromServer: (
    session: Omit<ChatSession, "messages"> & { messages?: ChatMessage[] }
  ) => void;
  setCurrentSessionIdFromServer: (sessionId: string) => void;
  setMessagesForSession: (sessionId: string, messages: ChatMessage[]) => void;
  /** Update one message without touching any other object in the store. */
  updateMessageInSession: (
    sessionId: string,
    id: string,
    updates: Partial<ChatMessage>
  ) => void;
  setOptimisticMessage: (message: ChatMessage | null) => void;

  setOpen: (open: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  setMaximized: (maximized: boolean) => void;
  toggleChat: () => void;
  setShowHistory: (show: boolean) => void;
  setLayoutMode: (mode: ChatLayoutMode) => void;
  openSessionTab: (sessionId: string) => void;
  closeSessionTab: (sessionId: string) => void;
  updatePageContext: (context: PageContext) => void;
}

const computeCurrentSessionAndMessages = (
  sessions: ChatSession[],
  currentSessionId: string | null
) => {
  const currentSession =
    sessions.find((s) => s.id === currentSessionId) || null;
  const messages = currentSession?.messages || [];
  return { currentSession, messages };
};

const CHAT_STORAGE_NAME = "chat-storage-v2";
const CHAT_STORAGE_MAX_SIZE = 256 * 1024;

type PersistedChatPreferences = {
  accountId?: string | null;
  currentSessionId?: string | null;
  layoutMode?: ChatLayoutMode;
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

/** Fields reset whenever the signed-in account changes. */
const accountScopedReset = {
  sessions: [],
  currentSession: null,
  messages: [],
  loadingBySession: {},
  isLoading: false,
  currentContext: null,
  isOpen: false,
  isMinimized: false,
  isMaximized: false,
  showHistory: false,
  optimisticMessage: null,
} satisfies Partial<ChatStore>;

// Preferences are written on every store change; skip the write (and the
// localStorage read) unless they actually changed. Token updates never do.
let lastWrittenPreferences: string | null = null;

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
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
      optimisticMessage: null,

      setOptimisticMessage: (message) => set({ optimisticMessage: message }),

      setAccountPending: () => {
        abortAllChatRequests();
        set({
          ...accountScopedReset,
          accountId: null,
          accountEpoch: get().accountEpoch + 1,
          isAccountReady: false,
          currentSessionId: null,
          openSessionIds: [],
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
          ...accountScopedReset,
          accountId,
          accountEpoch: changed
            ? current.accountEpoch + 1
            : current.accountEpoch,
          isAccountReady: current.isHydrated,
          currentSessionId: preferences?.currentSessionId ?? null,
          layoutMode: preferences?.layoutMode ?? "floating",
          lastNonFullpageLayout:
            preferences?.lastNonFullpageLayout ?? "floating",
          openSessionIds: preferences?.openSessionIds ?? [],
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

      updateMessageInSession: (sessionId, id, updates) => {
        set((current) => {
          const session = current.sessions.find((item) => item.id === sessionId);
          if (!session?.messages.some((message) => message.id === id))
            return current;
          // Only the session and the message change identity, so selectors on
          // other messages and on session metadata stay stable while streaming.
          const updated: ChatSession = {
            ...session,
            messages: session.messages.map((message) =>
              message.id === id ? { ...message, ...updates } : message
            ),
          };
          const sessions = current.sessions.map((item) =>
            item.id === sessionId ? updated : item
          );
          return sessionId === current.currentSessionId
            ? { sessions, currentSession: updated, messages: updated.messages }
            : { sessions };
        });
      },

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

          const titleGenerated =
            exists?.title === "New Chat" && session.title !== "New Chat";
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
            optimisticMessage:
              sessionId === state.currentSessionId
                ? null
                : state.optimisticMessage,
          };
        });
      },

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

      toggleChat: () => {
        const { isOpen, isMaximized } = get();
        if (!isOpen) {
          set({ isOpen: true, isMinimized: false, isMaximized: false });
        } else if (!isMaximized) {
          set({ isMaximized: true, isMinimized: false });
        } else {
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

      updatePageContext: (context) => {
        set({ currentContext: context });
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
        setItem: (_name: string, value: string) => {
          if (typeof window === "undefined" || value === lastWrittenPreferences)
            return;
          lastWrittenPreferences = value;
          try {
            const parsed = JSON.parse(value) as {
              state?: PersistedChatPreferences;
            };
            const accountId = parsed.state?.accountId;
            if (!accountId || new Blob([value]).size > CHAT_STORAGE_MAX_SIZE)
              return;
            window.localStorage.setItem(accountStorageKey(accountId), value);
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
        state.optimisticMessage = null;
      },
    }
  )
);
