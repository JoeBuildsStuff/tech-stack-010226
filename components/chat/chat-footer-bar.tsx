"use client";

import { useState } from "react";
import { MessagesSquare, GalleryVerticalEnd, X } from "lucide-react";
import { createChatSession } from "@/actions/chat";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/lib/chat/chat-store";
import { cn } from "@/lib/utils";

export function ChatFooterBar() {
  const {
    isOpen,
    isMinimized,
    setOpen,
    setMinimized,
    setMaximized,
    layoutMode,
    setLayoutMode,
    sessions,
    switchToSession,
    setShowHistory,
    currentSessionId,
    openSessionIds,
    openSessionTab,
    closeSessionTab,
    upsertSessionFromServer,
    setCurrentSessionIdFromServer,
  } = useChatStore();
  const [isCreating, setIsCreating] = useState(false);

  const handleAskChat = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await createChatSession();
      if ("error" in res && res.error) return;
      const row = res.data!;
      upsertSessionFromServer({
        id: row.id,
        title: row.title,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        messages: [],
      });
      setCurrentSessionIdFromServer(row.id);
      if (layoutMode === "inset") {
        setLayoutMode("inset");
      } else {
        setOpen(true);
        setMinimized(false);
        setMaximized(false);
      }
      setShowHistory(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenSession = (sessionId: string) => {
    switchToSession(sessionId);
    openSessionTab(sessionId);
    setShowHistory(false);
    if (!isOpen || isMinimized) {
      if (layoutMode === "inset") {
        setLayoutMode("inset");
      } else {
        setOpen(true);
        setMinimized(false);
        setMaximized(false);
      }
    }
  };

  const handleToggleHistory = () => {
    if (!isOpen || isMinimized) {
      setOpen(true);
      setMinimized(false);
      setMaximized(false);
      setShowHistory(true);
    } else {
      setShowHistory(true);
    }
  };

  if (layoutMode === "fullpage") {
    return null;
  }

  const openSessions = openSessionIds
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s != null);

  return (
    <div className="shrink-0 flex items-center justify-end bg-background z-50">
      <div className="flex items-center gap-0.5 pr-3 py-1">
        {openSessions.map((session) => {
          const isActive =
            session.id === currentSessionId && isOpen && !isMinimized;
          return (
            <div
              key={session.id}
              className={cn(
                "group flex w-[120px] shrink-0 items-center justify-between rounded-lg px-2 py-1 transition-colors hover:bg-secondary",
                isActive &&
                  "bg-secondary text-secondary-foreground hover:bg-secondary"
              )}
            >
              <button
                type="button"
                onClick={() => handleOpenSession(session.id)}
                className="relative min-w-0 flex-1 cursor-pointer overflow-hidden text-left"
              >
                <span
                  className={cn(
                    "block whitespace-nowrap text-xs",
                    isActive
                      ? "text-secondary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {session.title}
                </span>
                <div
                  className={cn(
                    "pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-r from-transparent transition-all group-hover:w-10",
                    isActive
                      ? "to-accent group-hover:to-accent"
                      : "to-background group-hover:to-secondary"
                  )}
                />
              </button>
              <button
                type="button"
                aria-label="Close tab"
                onClick={() => closeSessionTab(session.id)}
                className="ml-1 flex h-4 w-0 shrink-0 cursor-pointer items-center justify-center overflow-hidden border-0 bg-transparent p-0 opacity-0 transition-all group-hover:w-4 group-hover:opacity-100"
              >
                <X
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground",
                    isActive &&
                      "text-accent-foreground/70 hover:text-accent-foreground"
                  )}
                />
              </button>
            </div>
          );
        })}

        <Button
          variant="blue"
          size="sm"
          className="h-7 px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={handleAskChat}
          disabled={isCreating}
        >
          <MessagesSquare className="size-3.5" />
          Ask Chat
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={handleToggleHistory}
          title="Chat history"
        >
          <GalleryVerticalEnd className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
