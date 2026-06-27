"use client";

import { useChatStore } from "@/lib/chat/chat-store";
import { ChatMessage, ChatMessageLoading } from "./chat-message";
import { MessagesSquare } from "lucide-react";
import { MessageScrollerItem } from "@/components/ui/message-scroller";
import type { ChatAction } from "@/types/chat";

interface ChatMessagesListProps {
  onActionClick?: (action: ChatAction) => void;
}

export function ChatMessagesList({
  onActionClick,
}: ChatMessagesListProps = {}) {
  const { messages, isLoading } = useChatStore();
  const lastMessage = messages[messages.length - 1];
  const shouldShowLoading =
    isLoading &&
    !(lastMessage?.role === "assistant" && lastMessage.content.trim());

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-2">
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
    <>
      {messages.map((message) => (
        <MessageScrollerItem key={message.id} messageId={message.id}>
          <ChatMessage
            message={message}
            onActionClick={onActionClick}
          />
        </MessageScrollerItem>
      ))}

      {/* Show loading placeholder while waiting for API response */}
      {shouldShowLoading && (
        <MessageScrollerItem>
          <ChatMessageLoading />
        </MessageScrollerItem>
      )}

      {/* Invisible element marking the bottom of the message list */}
      <MessageScrollerItem scrollAnchor className="h-1" />
    </>
  );
}
