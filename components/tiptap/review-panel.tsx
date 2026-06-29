"use client";

import { useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import {
  Check,
  MessageSquareDashed,
  MoreVertical,
  Square,
  SquareCheckBig,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { isRichTextContentEmpty } from "@/components/tiptap/comment-content-utils";
import { CommentInputEditor } from "@/components/tiptap/comment-input-editor";
import type { SuggestionKind } from "@/components/tiptap/suggestion-types";
import type {
  ReviewFilters,
  ReviewItem,
} from "@/components/tiptap/review-types";

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return "";
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  if (isToday(parsed)) {
    return `Today at ${format(parsed, "p")}`;
  }
  if (isYesterday(parsed)) {
    return `Yesterday at ${format(parsed, "p")}`;
  }
  return format(parsed, "MMM d, yyyy 'at' p");
}

function userDisplay(userId: string | null, currentUserId: string | null) {
  if (!userId) {
    return "You";
  }
  return userId === currentUserId ? "You" : userId.slice(0, 8);
}

function userInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "U"
  );
}

function isInteractiveKeyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest(
      "input, textarea, button, select, [contenteditable='true'], [role='textbox'], [data-role='comment-input']"
    )
  );
}

const KIND_LABEL: Record<SuggestionKind, string> = {
  insert: "Insertion",
  delete: "Deletion",
  replace: "Replacement",
};

const KIND_VARIANT: Record<SuggestionKind, BadgeProps["variant"]> = {
  insert: "green",
  delete: "red",
  replace: "amber",
};

type EditingTarget = {
  parentId: string;
  commentId: string;
  scope: "comment" | "suggestion";
};

type ReviewPanelProps = {
  showReview: boolean;
  items: ReviewItem[];
  isLoading: boolean;
  currentUserId: string | null;
  currentUserInitials: string;
  currentUserAvatarUrl: string | null;
  filters: ReviewFilters;
  onFiltersChange: (
    updater: ReviewFilters | ((prev: ReviewFilters) => ReviewFilters)
  ) => void;
  onClose: () => void;

  // Comment threads
  selectedThreadId: string | null;
  replyContent: string;
  onReplyContentChange: (content: string) => void;
  onSelectThread: (threadId: string) => void;
  onHoverThread: (threadId: string | null) => void;
  onCreateReply: () => void;
  onToggleThreadResolved: (threadId: string, resolved: boolean) => void;
  onDeleteThread: (threadId: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  onUpdateComment: (
    threadId: string,
    commentId: string,
    content: string
  ) => Promise<boolean> | boolean;

  // Suggestions
  selectedSuggestionId: string | null;
  onSelectSuggestion: (suggestionId: string) => void;
  onHoverSuggestion: (suggestionId: string | null) => void;
  onAcceptSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onCreateSuggestionReply: (
    suggestionId: string,
    content: string
  ) => Promise<boolean>;
  onUpdateSuggestionReply: (
    suggestionId: string,
    replyId: string,
    content: string
  ) => Promise<boolean>;
  onDeleteSuggestionReply: (suggestionId: string, replyId: string) => void;
};

export function ReviewPanel({
  showReview,
  items,
  isLoading,
  currentUserId,
  currentUserInitials,
  currentUserAvatarUrl,
  filters,
  onFiltersChange,
  onClose,
  selectedThreadId,
  replyContent,
  onReplyContentChange,
  onSelectThread,
  onHoverThread,
  onCreateReply,
  onToggleThreadResolved,
  onDeleteThread,
  onDeleteComment,
  onUpdateComment,
  selectedSuggestionId,
  onSelectSuggestion,
  onHoverSuggestion,
  onAcceptSuggestion,
  onRejectSuggestion,
  onCreateSuggestionReply,
  onUpdateSuggestionReply,
  onDeleteSuggestionReply,
}: ReviewPanelProps) {
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [suggestionReply, setSuggestionReply] = useState("");
  const [isSubmittingSuggestionReply, setIsSubmittingSuggestionReply] =
    useState(false);

  // Reset the suggestion reply composer whenever the selection changes. Adjusting
  // state during render (instead of in an effect) avoids a cascading re-render.
  const [prevSelectedSuggestionId, setPrevSelectedSuggestionId] =
    useState(selectedSuggestionId);
  if (selectedSuggestionId !== prevSelectedSuggestionId) {
    setPrevSelectedSuggestionId(selectedSuggestionId);
    setSuggestionReply("");
  }

  const clearEditingState = () => {
    setEditing(null);
    setEditingContent("");
  };

  const submitEdit = (target: EditingTarget) => {
    if (isRichTextContentEmpty(editingContent) || isSubmittingEdit) {
      return;
    }

    setIsSubmittingEdit(true);
    const updater =
      target.scope === "comment"
        ? onUpdateComment(target.parentId, target.commentId, editingContent)
        : onUpdateSuggestionReply(
            target.parentId,
            target.commentId,
            editingContent
          );

    void Promise.resolve(updater)
      .then((didUpdate) => {
        if (didUpdate) {
          clearEditingState();
        }
      })
      .finally(() => {
        setIsSubmittingEdit(false);
      });
  };

  const submitSuggestionReply = (suggestionId: string) => {
    if (
      isRichTextContentEmpty(suggestionReply) ||
      isSubmittingSuggestionReply
    ) {
      return;
    }
    setIsSubmittingSuggestionReply(true);
    void Promise.resolve(onCreateSuggestionReply(suggestionId, suggestionReply))
      .then((didCreate) => {
        if (didCreate) {
          setSuggestionReply("");
        }
      })
      .finally(() => {
        setIsSubmittingSuggestionReply(false);
      });
  };

  const renderReply = (
    scope: "comment" | "suggestion",
    parentId: string,
    reply: {
      id: string;
      userId: string;
      content: string;
      createdAt: string;
    },
    onDelete: () => void
  ) => {
    const replyAuthor = userDisplay(reply.userId, currentUserId);
    const replyInitials =
      reply.userId === currentUserId
        ? currentUserInitials
        : userInitials(replyAuthor);
    const isEditingReply = Boolean(
      editing?.parentId === parentId &&
      editing.commentId === reply.id &&
      editing.scope === scope
    );

    return (
      <div key={reply.id} className="border-t border-border">
        <div className="px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <Avatar className="size-8 shrink-0">
                {reply.userId === currentUserId && currentUserAvatarUrl ? (
                  <AvatarImage src={currentUserAvatarUrl} alt={replyAuthor} />
                ) : null}
                <AvatarFallback>{replyInitials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="truncate text-sm font-semibold">{replyAuthor}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatTimestamp(reply.createdAt)}
                </p>
              </div>
            </div>
            {reply.userId === currentUserId ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Reply actions"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setEditing({ parentId, commentId: reply.id, scope });
                      setEditingContent(reply.content);
                    }}
                  >
                    <SquarePen className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <div className="mt-2">
            {isEditingReply ? (
              <div onClick={(event) => event.stopPropagation()}>
                <CommentInputEditor
                  value={editingContent}
                  onChange={setEditingContent}
                  onSubmitShortcut={() =>
                    submitEdit({ parentId, commentId: reply.id, scope })
                  }
                  placeholder="Edit"
                  editorClassName="text-sm"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={clearEditingState}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      submitEdit({ parentId, commentId: reply.id, scope })
                    }
                    disabled={
                      isRichTextContentEmpty(editingContent) || isSubmittingEdit
                    }
                  >
                    Submit
                  </Button>
                </div>
              </div>
            ) : (
              <CommentInputEditor
                value={reply.content}
                readOnly
                autoFocus={false}
                editorClassName="text-sm"
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCommentItem = (
    item: Extract<ReviewItem, { type: "comment" }>
  ) => {
    const thread = item.thread;
    const isSelected = selectedThreadId === thread.id;
    const firstComment = thread.comments[0];
    const authorName = userDisplay(
      firstComment?.userId ?? thread.createdBy,
      currentUserId
    );
    const authorInitials =
      (firstComment?.userId ?? thread.createdBy) === currentUserId
        ? currentUserInitials
        : userInitials(authorName);
    const createdAt = formatTimestamp(
      firstComment?.createdAt ?? thread.createdAt
    );
    const replies = thread.comments.slice(1);
    const replyCountLabel = `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`;
    const isEditingFirstComment = Boolean(
      firstComment &&
      editing?.parentId === thread.id &&
      editing.commentId === firstComment.id &&
      editing.scope === "comment"
    );
    const canEditFirstComment = firstComment?.userId === currentUserId;

    return (
      <div
        key={`comment-${thread.id}`}
        className={`w-full overflow-hidden rounded-xl border text-left text-xs transition ${
          isSelected
            ? "border-primary bg-primary/5 shadow-sm"
            : "cursor-pointer border-border hover:border-primary/50"
        }`}
        onClick={() => onSelectThread(thread.id)}
        onMouseEnter={() => onHoverThread(thread.id)}
        onMouseLeave={() => onHoverThread(null)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (isInteractiveKeyTarget(event.target)) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectThread(thread.id);
          }
        }}
      >
        <div className="px-3 pb-3 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <Avatar className="size-9 shrink-0">
                {firstComment?.userId === currentUserId &&
                currentUserAvatarUrl ? (
                  <AvatarImage src={currentUserAvatarUrl} alt={authorName} />
                ) : null}
                <AvatarFallback>{authorInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{authorName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {createdAt}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Checkbox
                checked={thread.status === "resolved"}
                onCheckedChange={(checked) => {
                  onToggleThreadResolved(thread.id, Boolean(checked));
                }}
                onClick={(event) => event.stopPropagation()}
                aria-label={
                  thread.status === "resolved"
                    ? "Reopen thread"
                    : "Resolve thread"
                }
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Comment actions"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(event) => event.stopPropagation()}
                >
                  {canEditFirstComment && firstComment ? (
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setEditing({
                          parentId: thread.id,
                          commentId: firstComment.id,
                          scope: "comment",
                        });
                        setEditingContent(firstComment.content);
                      }}
                    >
                      <SquarePen className="size-4" />
                      Edit
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteThread(thread.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="mt-2">
            {isEditingFirstComment && firstComment ? (
              <div onClick={(event) => event.stopPropagation()}>
                <CommentInputEditor
                  value={editingContent}
                  onChange={setEditingContent}
                  onSubmitShortcut={() =>
                    submitEdit({
                      parentId: thread.id,
                      commentId: firstComment.id,
                      scope: "comment",
                    })
                  }
                  placeholder="Edit comment"
                  editorClassName="text-sm"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={clearEditingState}>
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      submitEdit({
                        parentId: thread.id,
                        commentId: firstComment.id,
                        scope: "comment",
                      })
                    }
                    disabled={
                      isRichTextContentEmpty(editingContent) || isSubmittingEdit
                    }
                  >
                    Submit
                  </Button>
                </div>
              </div>
            ) : (
              <CommentInputEditor
                value={firstComment?.content ?? ""}
                readOnly
                autoFocus={false}
                editorClassName="text-sm"
              />
            )}
          </div>
          {replies.length > 0 && !isSelected ? (
            <p className="mt-2 text-xs font-medium dark:text-blue-400 text-blue-600">
              {replyCountLabel}
            </p>
          ) : null}
        </div>

        {isSelected && replies.length > 0 ? (
          <div>
            {replies.map((reply) =>
              renderReply("comment", thread.id, reply, () =>
                onDeleteComment(thread.id, reply.id)
              )
            )}
          </div>
        ) : null}

        {isSelected ? (
          <div className="border-t border-border bg-background/60">
            <div className="px-3 py-3">
              <div className="min-w-0" data-role="comment-input">
                <CommentInputEditor
                  value={replyContent}
                  onChange={onReplyContentChange}
                  placeholder="Add a reply"
                  onSubmitShortcut={onCreateReply}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={onCreateReply}
                  disabled={isRichTextContentEmpty(replyContent)}
                >
                  Add Reply
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderSuggestionItem = (
    item: Extract<ReviewItem, { type: "suggestion" }>
  ) => {
    const suggestion = item.suggestion;
    const isSelected = selectedSuggestionId === suggestion.id;
    const authorName = userDisplay(suggestion.createdBy, currentUserId);
    const authorInitials =
      suggestion.createdBy === currentUserId
        ? currentUserInitials
        : userInitials(authorName);
    const timestamp = formatTimestamp(suggestion.createdAt);
    const replies = suggestion.replies;
    const replyCountLabel = `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`;

    return (
      <div
        key={`suggestion-${suggestion.id}`}
        className={`w-full overflow-hidden rounded-xl border text-left text-xs transition ${
          isSelected
            ? "border-primary bg-primary/5 shadow-sm"
            : "cursor-pointer border-border hover:border-primary/50"
        }`}
        onClick={() => onSelectSuggestion(suggestion.id)}
        onMouseEnter={() => onHoverSuggestion(suggestion.id)}
        onMouseLeave={() => onHoverSuggestion(null)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (isInteractiveKeyTarget(event.target)) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectSuggestion(suggestion.id);
          }
        }}
      >
        <div className="px-3 pb-3 pt-3">
          <div className="flex items-start gap-2">
            <Avatar className="size-9 shrink-0">
              {suggestion.createdBy === currentUserId &&
              currentUserAvatarUrl ? (
                <AvatarImage src={currentUserAvatarUrl} alt={authorName} />
              ) : null}
              <AvatarFallback>{authorInitials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{authorName}</p>
              {timestamp ? (
                <p className="truncate text-xs text-muted-foreground">
                  {timestamp}
                </p>
              ) : null}
            </div>
          </div>

          <p className="mt-2 line-clamp-3 text-sm text-foreground wrap-break-word">
            <Badge variant={KIND_VARIANT[suggestion.kind]} className="mr-1.5">
              {KIND_LABEL[suggestion.kind]}
            </Badge>
            {suggestion.preview ? (
              <span>{suggestion.preview}</span>
            ) : (
              <span className="text-muted-foreground">(no preview)</span>
            )}
          </p>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onRejectSuggestion(suggestion.id);
              }}
            >
              <X className="size-4" />
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onAcceptSuggestion(suggestion.id);
              }}
            >
              <Check className="size-4" />
            </Button>
          </div>

          {replies.length > 0 && !isSelected ? (
            <p className="mt-2 text-xs font-medium dark:text-blue-400 text-blue-600">
              {replyCountLabel}
            </p>
          ) : null}
        </div>

        {isSelected && replies.length > 0 ? (
          <div>
            {replies.map((reply) =>
              renderReply("suggestion", suggestion.id, reply, () =>
                onDeleteSuggestionReply(suggestion.id, reply.id)
              )
            )}
          </div>
        ) : null}

        {isSelected ? (
          <div className="border-t border-border bg-background/60">
            <div className="px-3 py-3">
              <div className="min-w-0" data-role="comment-input">
                <CommentInputEditor
                  value={suggestionReply}
                  onChange={setSuggestionReply}
                  placeholder="Reply to this suggestion"
                  onSubmitShortcut={() => submitSuggestionReply(suggestion.id)}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => submitSuggestionReply(suggestion.id)}
                  disabled={
                    isRichTextContentEmpty(suggestionReply) ||
                    isSubmittingSuggestionReply
                  }
                >
                  Add Reply
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside
      aria-hidden={!showReview}
      className="flex min-h-0 min-w-80 w-80 flex-col rounded-md border border-border bg-card"
    >
      <div className="h-12 border-b border-border px-2">
        <div className="flex h-full items-center justify-between">
          <h2 className="text-sm font-semibold">Review</h2>
          <ButtonGroup>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Filter review items"
                  className="size-7 p-0"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    Show
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={filters.open}
                    onCheckedChange={(checked) =>
                      onFiltersChange((prev) => ({
                        ...prev,
                        open: checked === true,
                      }))
                    }
                  >
                    <Square />
                    Open comments
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={filters.resolved}
                    onCheckedChange={(checked) =>
                      onFiltersChange((prev) => ({
                        ...prev,
                        resolved: checked === true,
                      }))
                    }
                  >
                    <SquareCheckBig />
                    Resolved comments
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={filters.suggestions}
                    onCheckedChange={(checked) =>
                      onFiltersChange((prev) => ({
                        ...prev,
                        suggestions: checked === true,
                      }))
                    }
                  >
                    <SquarePen />
                    Suggestions
                  </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              aria-label="Close review panel"
              className="size-7 p-0"
            >
              <X className="size-4" />
            </Button>
          </ButtonGroup>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        {isLoading && items.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl opacity-75" />
          </div>
        ) : items.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareDashed />
              </EmptyMedia>
              <EmptyTitle>Nothing to review</EmptyTitle>
              <EmptyDescription>
                Comment on selected text, or turn on suggesting mode to track
                your edits.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2">
            {items.map((item) =>
              item.type === "comment"
                ? renderCommentItem(item)
                : renderSuggestionItem(item)
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
