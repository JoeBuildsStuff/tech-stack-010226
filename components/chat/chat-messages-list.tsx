"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/lib/chat/chat-store";
import { ChatMessage, ChatMessageLoading } from "./chat-message";
import { MessagesSquare } from "lucide-react";
import type { ChatAction } from "@/types/chat";

interface ChatMessagesListProps {
  onActionClick?: (action: ChatAction) => void;
}

export function ChatMessagesList({
  onActionClick,
}: ChatMessagesListProps = {}) {
  const { messages, isLoading } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];
  const shouldShowLoading =
    isLoading &&
    !(lastMessage?.role === "assistant" && lastMessage.content.trim());

  // Scroll the enclosing chat viewport directly. scrollIntoView() would also
  // scroll other ancestors, which can shift the page behind the chat panel.
  useEffect(() => {
    const viewport = messagesEndRef.current?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-2">
          <MessagesSquare
            className="size-8 text-muted-foreground mb-2"
            strokeWidth={1}
          />
          <p className="text-sm text-muted-foreground mb-4 font-light">
            Start a conversation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onActionClick={onActionClick}
        />
      ))}

      {/* Show loading placeholder while waiting for API response */}
      {shouldShowLoading && <ChatMessageLoading />}

      {/* Invisible element marking the bottom of the message list */}
      <div ref={messagesEndRef} className="h-1" />
    </div>
  );
}
