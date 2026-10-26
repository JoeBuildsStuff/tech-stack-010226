"use client";

import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ChatMessage as ChatMessageType, ChatAction } from "@/lib/chat/contracts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ChatMessageActions from "./chat-message-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentGroup } from "@/components/ui/attachment";
import {
  Message,
  MessageContent,
  MessageHeader,
  MessageFooter,
} from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { ChatMessageTrace } from "./chat-message-trace";
import { partsOf, replyTiming } from "@/lib/chat/parts";
import { toast } from "sonner";
import { useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/lib/chat/chat-store";
import { ChatAttachmentCard } from "@/components/chat/chat-attachment-card";
import { AttachmentPreviewDialog } from "@/components/chat/attachment-preview-dialog";
import type { ChatAttachmentLike } from "@/lib/chat/attachments";

// Import highlight.js styles
import "highlight.js/styles/github-dark.css";

interface ChatMessageProps {
  message: ChatMessageType;
  onActionClick?: (action: ChatAction) => void;
}

// Citation component with popover
const CitationPopover = ({
  citationNumber,
  citation,
}: {
  citationNumber: number;
  citation: { url: string; title: string; cited_text: string };
}) => {
  return (
    <Popover>
      <PopoverTrigger>
        <Badge className="" variant="blue">
          {citationNumber}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="p-3" align="start">
        <div className="space-y-2">
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <Badge
              variant="blue"
              className="font-medium text-sm break-words whitespace-normal"
            >
              {citation.title}
            </Badge>
          </a>
          {citation.cited_text && (
            <div className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
              &ldquo;
              {citation.cited_text.length > 150
                ? citation.cited_text.substring(0, 150) + "..."
                : citation.cited_text}
              &rdquo;
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * While streaming, a link arrives a few characters at a time; until it closes,
 * show its label instead of raw `[label](http` syntax.
 */
const stabilizeStreamingMarkdown = (text: string) =>
  text
    .replace(/\[([^\]\n]*)\]\([^)\n]*$/, "$1")
    .replace(/\[([^\]\n]*)$/, "$1");

// Function to render text with inline citations
const renderTextWithCitations = (
  text: string,
  citations: Array<{ url: string; title: string; cited_text: string }>
) => {
  // Find all citation patterns like [1], [2], etc.
  const citationRegex = /\[(\d+)\]/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the citation popover
    const citationNumber = parseInt(match[1]);
    const citation = citations[citationNumber - 1]; // Citations are 1-indexed

    if (citation) {
      parts.push(
        <CitationPopover
          key={`citation-${citationNumber}-${match.index}`}
          citationNumber={citationNumber}
          citation={citation}
        />
      );
    } else {
      // If citation not found, just show the number
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 1 ? <>{parts}</> : text;
};

function MessageMarkdown({
  text,
  citations,
}: {
  text: string;
  citations: Array<{ url: string; title: string; cited_text: string }>;
}) {
  return (
    <div className={cn("prose prose-sm max-w-none", "dark:prose-invert")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Only override what's absolutely necessary
          code: ({ children, ...props }) => {
            const isInline = !props.className?.includes("language-");
            return isInline ? (
              <code
                className={cn(
                  "px-1.5 py-0.5 rounded text-xs font-mono border",
                  "bg-muted/60 border-muted-foreground/20"
                )}
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className="text-xs font-mono" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              className={cn(
                "p-3 rounded-md overflow-x-auto my-2 border text-xs",
                "bg-muted/60 border-muted-foreground/20"
              )}
            >
              {children}
            </pre>
          ),
          // Custom text renderer to handle inline citations
          p: ({ children }) => (
            <p>
              {typeof children === "string"
                ? renderTextWithCitations(children, citations)
                : children}
            </p>
          ),
          // Handle list items to process citations within them
          li: ({ children }) => (
            <li>
              {typeof children === "string"
                ? renderTextWithCitations(children, citations)
                : children}
            </li>
          ),
          // Also handle text nodes that aren't in paragraphs
          text: ({ children }) =>
            typeof children === "string"
              ? renderTextWithCitations(children, citations)
              : children,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// Loading placeholder shown before the assistant message exists
export function ChatMessageLoading() {
  return (
    <Message align="start" className="px-0 py-2">
      <MessageContent>
        <p className="px-3 text-sm font-light">
          <span className="text-shimmer motion-reduce:animate-none">
            Planning next moves
          </span>
        </p>
      </MessageContent>
    </Message>
  );
}

export function ChatMessage({ message, onActionClick }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [selectedAttachment, setSelectedAttachment] =
    useState<ChatAttachmentLike | null>(null);
  const { isLoading, editMessage } = useChat();
  const accountId = useChatStore((state) => state.accountId);
  const accountEpoch = useChatStore((state) => state.accountEpoch);

  // Whether the message has any visible body yet. An assistant message starts
  // out empty while streaming, so its header/body should stay hidden until real
  // content (or tool calls/reasoning/attachments) has arrived.
  const hasRenderableBody =
    message.content.trim().length > 0 ||
    (message.parts?.length ?? 0) > 0 ||
    (message.attachments?.length ?? 0) > 0;

  // The server generates the reply whether or not this tab is watching, so a
  // pending/streaming status means it is still being written.
  const isStreaming =
    message.status === "pending" || message.status === "streaming";
  const awaitingInput = message.status === "awaiting_input";
  // The footer actions (copy/retry/edit/thumbs) act on the final text
  // response, so the assistant's appear once the reply has stopped.
  const hasActionableContent = isUser
    ? message.content.trim().length > 0
    : message.status === "completed" ||
      message.status === "failed" ||
      message.status === "cancelled";

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleEditSave = async () => {
    const content = editContent.trim();
    if (!content || content === message.content || isLoading) {
      setIsEditing(false);
      return;
    }

    const requestEpoch = accountEpoch;
    const requestAccountId = accountId;
    try {
      await editMessage(message.id, content);
      const current = useChatStore.getState();
      if (
        current.accountId !== requestAccountId ||
        current.accountEpoch !== requestEpoch ||
        !current.isAccountReady
      ) {
        setIsEditing(false);
        return;
      }
      toast.success("Message updated");
      setIsEditing(false);
    } catch (error) {
      const current = useChatStore.getState();
      if (
        current.accountId === requestAccountId &&
        current.accountEpoch === requestEpoch &&
        current.isAccountReady
      ) {
        toast.error("Unable to update message", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === "Escape") {
      handleEditCancel();
    }
  };

  const handleEditCancel = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const openAttachmentModal = (attachment: ChatAttachmentLike) => {
    setSelectedAttachment(attachment);
  };

  const closeAttachmentModal = () => {
    setSelectedAttachment(null);
  };

  // System messages get a centered pill treatment outside the Message layout
  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="bg-muted/50 text-muted-foreground text-xs italic px-4 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <>
      <Message align={isUser ? "end" : "start"} className="px-0 py-2">
        <MessageContent className={cn("gap-1", isUser && "items-end")}>
          {/* Timestamp - the assistant's sits in its footer, after the answer */}
          {isUser && hasRenderableBody && (
            <MessageHeader className={cn("px-1", isUser && "justify-end")}>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(message.timestamp, { addSuffix: true })}
              </span>
            </MessageHeader>
          )}

          {/* Attachments - shown for user messages */}
          {isUser && message.attachments && message.attachments.length > 0 && (
            <AttachmentGroup className="max-w-72 gap-1.5 pb-1">
              {message.attachments.map((attachment) => (
                <ChatAttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  variant="message"
                  onPreview={openAttachmentModal}
                />
              ))}
            </AttachmentGroup>
          )}

          {!isUser && (
            <ChatMessageTrace
              parts={partsOf(message)}
              streaming={isStreaming}
              {...replyTiming(message)}
              renderText={(text, key, isLast) => (
                <div key={key} className="px-1 text-sm font-normal text-foreground break-words">
                  <MessageMarkdown
                    text={
                      isStreaming && isLast
                        ? stabilizeStreamingMarkdown(text)
                        : text
                    }
                    citations={message.citations || []}
                  />
                </div>
              )}
            />
          )}

          {awaitingInput && (
            <p className="px-1 text-sm text-muted-foreground">
              Waiting for your answer below.
            </p>
          )}
          {(message.status === "failed" || message.status === "cancelled") && (
            <Badge
              variant={
                message.status === "failed" ? "destructive" : "secondary"
              }
              className="mb-2"
            >
              {message.status === "failed"
                ? "Response failed"
                : "Response stopped"}
            </Badge>
          )}

          {/* Message bubble or editing textarea */}
          {isEditing && isUser ? (
            <Bubble align="end">
              <BubbleContent className="rounded-lg px-3 py-2 text-sm bg-muted">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="bg-transparent dark:bg-transparent shadow-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-none p-0 resize-none"
                  placeholder="Edit your message..."
                  autoFocus
                />
                <div className="flex gap-2 items-center justify-end">
                  <Button
                    size="sm"
                    onClick={handleEditCancel}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleEditSave} variant="outline">
                    Send
                  </Button>
                </div>
              </BubbleContent>
            </Bubble>
          ) : // Only render message bubble if there's content
          isUser && message.content.trim() ? (
            <Bubble align="end">
              <BubbleContent className="rounded-lg px-3 py-2 text-sm break-words bg-muted">
                <MessageMarkdown
                  text={message.content}
                  citations={message.citations || []}
                />
              </BubbleContent>
            </Bubble>
          ) : null}

          {/* Only show actions when not editing and there's content to act on */}
          {hasActionableContent && (
            <MessageFooter className={cn(isUser && "justify-end")}>
              {!isEditing && (
                <ChatMessageActions message={message} onEdit={handleEdit} />
              )}
              {!isUser && (
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                </span>
              )}
            </MessageFooter>
          )}

          {/* Suggested actions */}
          {message.suggestedActions && message.suggestedActions.length > 0 && (
            <div
              className={cn(
                "flex flex-wrap gap-2 mt-2",
                isUser && "justify-end"
              )}
            >
              {message.suggestedActions.map((action, index) => (
                <button
                  key={index}
                  className={cn(
                    "text-xs px-2 py-1 rounded-md",
                    "bg-secondary text-secondary-foreground",
                    "hover:bg-secondary/80 transition-colors",
                    "border border-border"
                  )}
                  onClick={() => onActionClick?.(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </MessageContent>
      </Message>

      <AttachmentPreviewDialog
        attachment={selectedAttachment}
        onOpenChange={closeAttachmentModal}
      />
    </>
  );
}
