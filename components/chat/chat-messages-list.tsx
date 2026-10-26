"use client";

import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "@/lib/chat/chat-store";
import { ChatMessage, ChatMessageLoading } from "./chat-message";
import { MessagesSquare } from "lucide-react";
import { MessageScrollerItem } from "@/components/ui/message-scroller";
import { MessageGroup } from "@/components/ui/message";
import type { ChatAction } from "@/lib/chat/contracts";

interface ChatMessagesListProps {
  onActionClick?: (action: ChatAction) => void;
}

/**
 * Subscribes to message ids and roles only. A streamed token changes one
 * message object, which re-renders that row and nothing else.
 */
export function ChatMessagesList({
  onActionClick,
}: ChatMessagesListProps = {}) {
  const rows = useChatStore(
    useShallow((state) =>
      state.messages.map((message) => `${message.role}:${message.id}`)
    )
  );
  const isLoading = useChatStore((state) => state.isLoading);
  const optimisticId = useChatStore((state) => state.optimisticMessage?.id);

  const messages = rows.map((row) => {
    const separator = row.indexOf(":");
    return { role: row.slice(0, separator), id: row.slice(separator + 1) };
  });
  const lastMessage = messages.at(-1);
  // Once the assistant placeholder exists it renders its own live status.
  const shouldShowLoading = isLoading && lastMessage?.role !== "assistant";
  // The optimistic message is superseded once the real turn lands (it shares
  // no id with any persisted message), so only show it while nothing newer
  // has arrived for this send.
  const showOptimisticMessage =
    Boolean(optimisticId) && lastMessage?.id !== optimisticId;

  if (messages.length === 0 && !isLoading && !showOptimisticMessage) {
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

  // Collapse runs of consecutive same-role messages into a single MessageGroup
  // so same-sender bubbles read as one visual unit.
  const messageGroups = messages.reduce<(typeof messages)[]>((groups, message) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0].role === message.role) {
      lastGroup.push(message);
    } else {
      groups.push([message]);
    }
    return groups;
  }, []);

  return (
    <>
      {messageGroups.map((group) => (
        <MessageGroup key={group[0].id}>
          {group.map((message) => (
            <MessageScrollerItem key={message.id} messageId={message.id}>
              <MessageRow id={message.id} onActionClick={onActionClick} />
            </MessageScrollerItem>
          ))}
        </MessageGroup>
      ))}

      {/* Show the just-sent message immediately, before the server round trip */}
      {showOptimisticMessage && (
        <MessageScrollerItem key={optimisticId}>
          <OptimisticRow onActionClick={onActionClick} />
        </MessageScrollerItem>
      )}

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

const MessageRow = memo(function MessageRow({
  id,
  onActionClick,
}: {
  id: string;
  onActionClick?: (action: ChatAction) => void;
}) {
  const message = useChatStore((state) =>
    state.messages.find((item) => item.id === id)
  );
  return message ? (
    <ChatMessage message={message} onActionClick={onActionClick} />
  ) : null;
});

function OptimisticRow({
  onActionClick,
}: {
  onActionClick?: (action: ChatAction) => void;
}) {
  const message = useChatStore((state) => state.optimisticMessage);
  return message ? (
    <ChatMessage message={message} onActionClick={onActionClick} />
  ) : null;
}
