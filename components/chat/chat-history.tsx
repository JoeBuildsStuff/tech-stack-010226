"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronRight, MessagesSquare, SquarePen, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useChatStore } from "@/lib/chat/chat-store";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/use-chat";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import {
  createChatSession,
  deleteChatSession,
  listChatSessions,
} from "@/actions/chat";
import { Skeleton } from "../ui/skeleton";

// Type for the mapped session data returned by listChatSessions
type ChatSessionSummaryRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export function ChatHistory() {
  const {
    currentSessionId,
    setShowHistory,
    deleteSession: deleteLocalSession,
    upsertSessionFromServer,
    setCurrentSessionIdFromServer,
    openSessionTab,
    accountId,
    accountEpoch,
    isAccountReady,
  } = useChatStore();
  const { loadConversation } = useChat();

  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      title: string;
      updatedAt: Date;
      createdAt: Date;
      messageCount: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAccountReady || !accountId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    const requestEpoch = accountEpoch;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const res = await listChatSessions(accountId);
      const current = useChatStore.getState();
      if (
        cancelled ||
        current.accountId !== accountId ||
        current.accountEpoch !== requestEpoch ||
        !current.isAccountReady
      ) {
        setLoading(false);
        return;
      }
      if ("error" in res && res.error) {
        setLoading(false);
        toast.error("Unable to load chat history", { description: res.error });
        return;
      }
      const mapped = (res.data || []).map((row: ChatSessionSummaryRow) => ({
        id: row.id,
        title: row.title,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        messageCount: row.message_count ?? 0,
      }));
      // prime store sessions list
      mapped.forEach((s) =>
        upsertSessionFromServer({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })
      );
      setSessions(mapped);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountEpoch, accountId, isAccountReady, upsertSessionFromServer]);

  const handleSessionClick = async (sessionId: string) => {
    if (loadingSessionId || !isAccountReady || !accountId) return;
    const requestEpoch = accountEpoch;
    setLoadingSessionId(sessionId);
    try {
      await loadConversation(sessionId);
      const current = useChatStore.getState();
      if (
        current.accountId !== accountId ||
        current.accountEpoch !== requestEpoch ||
        !current.isAccountReady
      ) {
        return;
      }
      openSessionTab(sessionId);
      setShowHistory(false);
    } catch (error) {
      const current = useChatStore.getState();
      if (
        current.accountId === accountId &&
        current.accountEpoch === requestEpoch &&
        current.isAccountReady
      ) {
        toast.error("Unable to open chat", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      }
    } finally {
      setLoadingSessionId(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!accountId || !isAccountReady) return;
    const requestEpoch = accountEpoch;
    const res = await deleteChatSession(sessionId, accountId);
    const current = useChatStore.getState();
    if (
      current.accountId !== accountId ||
      current.accountEpoch !== requestEpoch ||
      !current.isAccountReady
    ) {
      return;
    }
    if ("error" in res && res.error) {
      toast.error("Unable to delete chat", { description: res.error });
      return;
    }
    // update local store and list
    deleteLocalSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const handleNewChat = async () => {
    if (!accountId || !isAccountReady) return;
    const requestEpoch = accountEpoch;
    const res = await createChatSession({ accountId });
    const current = useChatStore.getState();
    if (
      current.accountId !== accountId ||
      current.accountEpoch !== requestEpoch ||
      !current.isAccountReady
    ) {
      return;
    }
    if ("error" in res && res.error) {
      toast.error("Unable to create chat", { description: res.error });
      return;
    }
    const row = res.data!;
    const s = {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: 0,
    };
    upsertSessionFromServer({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    });
    setCurrentSessionIdFromServer(s.id);
    setSessions((prev) => [s, ...prev]);
  };

  const handleBackToChat = () => {
    setShowHistory(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-tl-xl"
            onClick={handleNewChat}
            title="New chat"
          >
            <SquarePen className="size-4" strokeWidth={1} />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-tr-xl"
            onClick={handleBackToChat}
            title="Back to current chat"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center text-center gap-2">
              <Skeleton className="h-[4.5rem] w-full" />
              <Skeleton className="h-[4.5rem] w-full" />
              <Skeleton className="h-[4.5rem] w-full" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessagesSquare
                className="size-8 text-muted-foreground mb-2"
                strokeWidth={1}
              />
              <p className="text-sm text-muted-foreground mb-4 font-light">
                No chat history yet
              </p>
              <Button
                className="flex items-center "
                variant="outline"
                size="sm"
                onClick={handleNewChat}
              >
                <span className="font-light">Start chat</span>
                <ChevronRight className="size-4" strokeWidth={1} />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "group flex flex-col p-2 rounded-lg cursor-pointer overflow-hidden",
                    "hover:bg-accent/50 transition-colors",
                    "border border-transparent",
                    session.id === currentSessionId && "bg-accent border-border"
                  )}
                  onClick={() => handleSessionClick(session.id)}
                >
                  {/* Session Title */}
                  <div className="flex items-center gap-2 min-w-0 overflow-hidden justify-between">
                    <h3
                      className={cn(
                        "flex font-medium text-sm overflow-hidden text-ellipsis whitespace-nowrap",
                        session.id === currentSessionId &&
                          "text-accent-foreground"
                      )}
                    >
                      {session.title.slice(0, 20)}
                    </h3>
                    {/* Delete Button */}
                    <div
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        onClick={() => handleDeleteSession(session.id)}
                      >
                        <Trash className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Session Meta */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                    <span>
                      {session.messageCount} message
                      {session.messageCount !== 1 ? "s" : ""}
                    </span>
                    <span>
                      {formatDistanceToNow(session.updatedAt, {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
