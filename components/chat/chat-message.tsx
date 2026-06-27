"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ChevronDown,
  CopyIcon,
  Lightbulb,
  FileText,
  FileVideo,
  File,
  FileArchive,
  FileSpreadsheet,
  Headphones,
  Image as ImageIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ChatMessage as ChatMessageType, ChatAction } from "@/types/chat";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ChatMessageActions from "./chat-message-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import {
  Message,
  MessageContent,
  MessageHeader,
  MessageFooter,
} from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerIcon, MarkerContent } from "@/components/ui/marker";
import { toast } from "sonner";
import {
  formatToolCallArguments,
  formatToolCallResult,
} from "@/lib/chat/utils";
import { useState } from "react";
import { useChatStore } from "@/lib/chat/chat-store";
import { useChat } from "@/hooks/use-chat";
import Spinner from "@/components/ui/spinner";

// Import highlight.js styles
import "highlight.js/styles/github-dark.css";

interface ChatMessageProps {
  message: ChatMessageType;
  onActionClick?: (action: ChatAction) => void;
}

interface MessageAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  data?: string; // base64 data for images
}

// Helper functions for file handling
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const getFileIcon = (attachment: MessageAttachment) => {
  const fileType = attachment.type;
  const fileName = attachment.name;

  const iconMap = {
    pdf: {
      icon: FileText,
      conditions: (type: string, name: string) =>
        type.includes("pdf") ||
        name.endsWith(".pdf") ||
        type.includes("word") ||
        name.endsWith(".doc") ||
        name.endsWith(".docx"),
    },
    archive: {
      icon: FileArchive,
      conditions: (type: string, name: string) =>
        type.includes("zip") ||
        type.includes("archive") ||
        name.endsWith(".zip") ||
        name.endsWith(".rar"),
    },
    excel: {
      icon: FileSpreadsheet,
      conditions: (type: string, name: string) =>
        type.includes("excel") ||
        name.endsWith(".xls") ||
        name.endsWith(".xlsx"),
    },
    video: {
      icon: FileVideo,
      conditions: (type: string) => type.includes("video/"),
    },
    audio: {
      icon: Headphones,
      conditions: (type: string) => type.includes("audio/"),
    },
    image: {
      icon: ImageIcon,
      conditions: (type: string) => type.startsWith("image/"),
    },
  };

  for (const { icon: Icon, conditions } of Object.values(iconMap)) {
    if (conditions(fileType, fileName)) {
      return <Icon className="size-4 opacity-60" />;
    }
  }

  return <File className="size-4 opacity-60" />;
};

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
          <a href={citation.url} target="_blank" rel="noopener noreferrer" className="inline-block">
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

// Reasoning component
const ReasoningDisplay = ({ reasoning }: { reasoning: string }) => {
  return (
    <div className="mb-2 w-72 prose prose-sm max-w-none dark:prose-invert rounded-lg px-3 py-2 text-sm break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
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
        }}
      >
        {reasoning}
      </ReactMarkdown>
    </div>
  );
};

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

// Loading placeholder component
export function ChatMessageLoading() {
  return (
    <Message align="start" className="px-0 py-2">
      <MessageContent>
        {/* Loading message bubble */}
        <Bubble>
          <BubbleContent className="rounded-lg px-3 py-2 text-sm bg-muted flex items-center gap-2">
            <Spinner className="stroke-5 size-4 stroke-muted-foreground" />
            {/* <span className="text-muted-foreground">Thinking...</span> */}
          </BubbleContent>
        </Bubble>
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
    useState<MessageAttachment | null>(null);
  const { editMessage, retryMessage } = useChatStore();
  const { sendMessage } = useChat();

  // Whether the message has any visible body yet. An assistant message starts
  // out empty while streaming, so its header/body should stay hidden until real
  // content (or tool calls/reasoning/attachments) has arrived.
  const hasRenderableBody =
    message.content.trim().length > 0 ||
    (message.toolCalls?.length ?? 0) > 0 ||
    (message.attachments?.length ?? 0) > 0 ||
    Boolean(message.reasoning);

  // The footer actions (copy/retry/edit/thumbs) act on the final text response,
  // so they should only appear once there's actual content — not while a tool
  // call is still running and the text hasn't streamed in yet.
  const hasActionableContent =
    message.content.trim().length > 0 || Boolean(message.functionResult);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleEditSave = () => {
    if (editContent.trim() !== message.content) {
      editMessage(message.id, editContent.trim());
      toast.success("Message updated");
      // After updating the message content, trim chat history to this point
      // and resend the edited message to get a fresh assistant reply.
      retryMessage(message.id, (content) => {
        // Resend using the existing user message (no new user bubble)
        sendMessage(content, undefined, undefined, undefined, {
          skipUserAdd: true,
        });
      });
    }
    setIsEditing(false);
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

  const openAttachmentModal = (attachment: MessageAttachment) => {
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
          {/* Timestamp */}
          {hasRenderableBody && (
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
                <Attachment
                  key={attachment.id}
                  orientation="vertical"
                  size="xs"
                  className="w-[60px] min-w-[60px] cursor-pointer rounded-md bg-background"
                >
                  {/* File Preview */}
                  <AttachmentMedia
                    variant={
                      attachment.type.startsWith("image/") &&
                      (attachment.data || attachment.url)
                        ? "image"
                        : "icon"
                    }
                    className="w-full rounded-t-[inherit] bg-accent"
                  >
                    {attachment.type.startsWith("image/") &&
                    (attachment.data || attachment.url) ? (
                      // Use base64 data when present (fresh uploads), otherwise fallback to signed URL
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={attachment.data || attachment.url!}
                        alt={attachment.name}
                        className="size-full rounded-t-[inherit] object-cover"
                      />
                    ) : (
                      getFileIcon(attachment)
                    )}
                  </AttachmentMedia>

                  {/* File Info */}
                  <AttachmentContent className="flex flex-col gap-0 border-t p-1">
                    <AttachmentTitle className="text-[9px] font-medium leading-tight">
                      {attachment.name.length > 8
                        ? attachment.name.substring(0, 8) + "..."
                        : attachment.name}
                    </AttachmentTitle>
                    <AttachmentDescription className="text-[8px] leading-tight">
                      {formatFileSize(attachment.size)}
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentTrigger
                    aria-label={`Preview ${attachment.name}`}
                    onClick={() => openAttachmentModal(attachment)}
                  />
                </Attachment>
              ))}
            </AttachmentGroup>
          )}

          {/* Reasoning - shown before tool calls and content for non-system messages */}
          {message.reasoning && (
            <ReasoningDisplay reasoning={message.reasoning} />
          )}

          {/* Tool calls with individual reasoning - shown before the response for non-system messages */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="space-y-2 mb-2 w-72">
              {message.toolCalls.map((toolCall) => (
                <div key={toolCall.id} className="space-y-2">
                  {/* Reasoning for this specific tool call */}
                  {toolCall.reasoning && (
                    <ReasoningDisplay reasoning={toolCall.reasoning} />
                  )}

                  {/* Tool call */}
                  <Collapsible className="rounded-lg px-3 py-2 text-sm break-words text-foreground font-light border border-border">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center justify-between w-full cursor-pointer group">
                        <Marker className="gap-2">
                          <MarkerIcon>
                            {toolCall.result ? (
                              <Lightbulb className="size-4 shrink-0" strokeWidth={1.5} />
                            ) : (
                              <Spinner className="size-4 shrink-0 stroke-muted-foreground" />
                            )}
                          </MarkerIcon>
                          <MarkerContent className="text-muted-foreground group-hover:underline text-sm">
                            {toolCall.result
                              ? toolCall.name
                              : `Running ${toolCall.name}…`}
                          </MarkerContent>
                        </Marker>
                        <ChevronDown
                          className="size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform"
                          strokeWidth={1.5}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-2 mt-2">
                        {/* Tool Arguments */}
                        <div className="flex flex-col gap-1 bg-background/30 p-2 rounded-md relative">
                          <Marker variant="separator" className="text-xs text-muted-foreground font-medium pb-1">
                            <MarkerContent>Request</MarkerContent>
                          </Marker>
                          <pre className="text-xs p-2 overflow-x-auto whitespace-pre-wrap break-words max-w-full">
                            {formatToolCallArguments(toolCall.arguments)}
                          </pre>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-1 right-1 h-6 w-6 p-0"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                formatToolCallArguments(toolCall.arguments)
                              );
                              toast.success("Arguments copied to clipboard");
                            }}
                          >
                            <CopyIcon className="size-3" strokeWidth={1.5} />
                          </Button>
                        </div>
                        {/* Tool Result */}
                        {toolCall.result && (
                          <div className="flex flex-col gap-1 bg-background/30 p-2 rounded-md relative">
                            <Marker variant="separator" className="text-xs text-muted-foreground font-medium pb-1">
                              <MarkerContent>
                                Result: {toolCall.result.success ? "Success" : "Error"}
                              </MarkerContent>
                            </Marker>
                            <pre className="text-xs p-2 overflow-x-auto whitespace-pre-wrap break-words max-w-full">
                              {formatToolCallResult(toolCall.result)}
                            </pre>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-1 right-1 h-6 w-6 p-0"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  formatToolCallResult(toolCall.result)
                                );
                                toast.success("Result copied to clipboard");
                              }}
                            >
                              <CopyIcon className="size-3" strokeWidth={1.5} />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </div>
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
                  <Button size="sm" onClick={handleEditCancel} variant="outline">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleEditSave} variant="outline">
                    Send
                  </Button>
                </div>
              </BubbleContent>
            </Bubble>
          ) : // Only render message bubble if there's content
          message.content.trim() ? (
            <Bubble align={isUser ? "end" : "start"}>
              <BubbleContent
                className={cn(
                  "rounded-lg px-3 py-2 text-sm break-words",
                  isUser ? "bg-muted" : "text-foreground"
                )}
              >
                <div
                  className={cn("prose prose-sm max-w-none", "dark:prose-invert")}
                >
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
                      p: ({ children }) => {
                        if (typeof children === "string") {
                          return (
                            <p>
                              {renderTextWithCitations(
                                children,
                                message.citations || []
                              )}
                            </p>
                          );
                        }
                        return <p>{children}</p>;
                      },
                      // Handle list items to process citations within them
                      li: ({ children }) => {
                        if (typeof children === "string") {
                          return (
                            <li>
                              {renderTextWithCitations(
                                children,
                                message.citations || []
                              )}
                            </li>
                          );
                        }
                        return <li>{children}</li>;
                      },
                      // Also handle text nodes that aren't in paragraphs
                      text: ({ children }) => {
                        if (typeof children === "string") {
                          return renderTextWithCitations(
                            children,
                            message.citations || []
                          );
                        }
                        return children;
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </BubbleContent>
            </Bubble>
          ) : null}

          {/* Only show actions when not editing and there's content to act on */}
          {hasActionableContent && (
            <MessageFooter className={cn(isUser && "justify-end")}>
              {!isEditing && (
                <ChatMessageActions message={message} onEdit={handleEdit} />
              )}

              {/* Function result indicator */}
              {message.functionResult && (
                <Badge
                  variant={message.functionResult.success ? "green" : "red"}
                  className="mt-1"
                >
                  {message.functionResult.success
                    ? "✓ Action completed"
                    : "✗ Action failed"}
                </Badge>
              )}
            </MessageFooter>
          )}

          {/* Suggested actions */}
          {message.suggestedActions && message.suggestedActions.length > 0 && (
            <div className={cn("flex flex-wrap gap-2 mt-2", isUser && "justify-end")}>
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

      {/* Attachment Preview Modal */}
      <Dialog open={!!selectedAttachment} onOpenChange={closeAttachmentModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <div className="relative">
            {selectedAttachment && (
              <div className="flex flex-col">
                {/* File Header */}
                <div className="flex items-center gap-3 p-4 border-b">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium truncate">
                      {selectedAttachment.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedAttachment.type} •{" "}
                      {formatFileSize(selectedAttachment.size)}
                    </p>
                  </div>
                </div>

                {/* File Content */}
                <div className="flex-1 overflow-auto">
                  {selectedAttachment.type.startsWith("image/") ? (
                    <div className="flex items-center justify-center p-4">
                      {/* Always use img to avoid Next/Image remote domain config */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          selectedAttachment.data ||
                          selectedAttachment.url ||
                          ""
                        }
                        alt={selectedAttachment.name}
                        className="max-w-full max-h-[70vh] object-contain rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-8">
                      <div className="text-center">
                        {getFileIcon(selectedAttachment)}
                        <p className="mt-2 text-sm text-muted-foreground">
                          Preview not available for this file type
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedAttachment.name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
