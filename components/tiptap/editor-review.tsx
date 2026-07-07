"use client";

import type { Editor } from "@tiptap/react";

import { ReviewPanel } from "@/components/tiptap/review-panel";
import { CommentComposerPopover } from "@/components/tiptap/comment-composer-popover";
import { isDocumentLevelThread } from "@/components/tiptap/comment-thread-types";
import type { RichTextEditorCore } from "@/components/tiptap/use-rich-text-editor";

/**
 * The unified review side panel (comments + suggestions), wired from the core.
 * Width animates between collapsed/expanded like the original notes editor.
 */
export function EditorReviewPanel({
  core,
  editor,
}: {
  core: RichTextEditorCore;
  editor: Editor;
}) {
  const {
    comments,
    commentsEnabled,
    suggestions,
    effectiveShowReview,
    setEffectiveShowReview,
    reviewItems,
    reviewFilters,
    setReviewFilters,
  } = core;

  return (
    <div
      className={`flex shrink-0 overflow-hidden transition-[width] duration-200 ease-linear ${
        effectiveShowReview ? "w-80" : "w-0"
      }`}
    >
      <ReviewPanel
        showReview={effectiveShowReview}
        items={reviewItems}
        isLoading={comments.isLoadingThreads || suggestions.isLoadingSuggestions}
        currentUserId={comments.currentUserId ?? suggestions.currentUserId}
        currentUserInitials={comments.initials || suggestions.initials}
        currentUserAvatarUrl={comments.currentUserAvatarUrl}
        filters={reviewFilters}
        onFiltersChange={setReviewFilters}
        onAddDocumentComment={
          commentsEnabled
            ? (target) => {
                const rect = target.getBoundingClientRect();
                comments.handleOpenComposer({
                  anchorFrom: 1,
                  anchorTo: 1,
                  anchorExact: "",
                  anchorPrefix: "",
                  anchorSuffix: "",
                  position: {
                    top: rect.bottom + 8,
                    left: rect.left + rect.width / 2,
                  },
                });
              }
            : undefined
        }
        onClose={() => setEffectiveShowReview(false)}
        selectedThreadId={comments.selectedThreadId}
        replyContent={comments.replyContent}
        onReplyContentChange={comments.setReplyContent}
        onSelectThread={(threadId) => {
          suggestions.setSelectedSuggestionId(null);
          editor.commands.selectSuggestion(null);
          comments.setSelectedThreadId(threadId);
          const thread = comments.threads.find((item) => item.id === threadId);
          editor.commands.selectCommentThread(threadId);
          if (thread && !isDocumentLevelThread(thread)) {
            editor.commands.focusCommentThread(threadId);
          }
        }}
        onHoverThread={(threadId) =>
          editor.commands.hoverCommentThread(threadId)
        }
        onCreateReply={comments.handleCreateReply}
        onToggleThreadResolved={comments.handleToggleThreadResolved}
        onDeleteThread={comments.handleDeleteThread}
        onDeleteComment={comments.handleDeleteComment}
        onUpdateComment={comments.handleUpdateComment}
        selectedSuggestionId={suggestions.selectedSuggestionId}
        onSelectSuggestion={(suggestionId) => {
          comments.setSelectedThreadId(null);
          editor.commands.selectCommentThread(null);
          suggestions.handleSelectSuggestion(suggestionId);
        }}
        onHoverSuggestion={suggestions.handleHoverSuggestion}
        onAcceptSuggestion={suggestions.handleAcceptSuggestion}
        onRejectSuggestion={suggestions.handleRejectSuggestion}
        onCreateSuggestionReply={suggestions.handleCreateSuggestionReply}
        onUpdateSuggestionReply={suggestions.handleUpdateSuggestionReply}
        onDeleteSuggestionReply={suggestions.handleDeleteSuggestionReply}
      />
    </div>
  );
}

/** The comment composer popover, shown when a selection is being commented on. */
export function EditorComposer({ core }: { core: RichTextEditorCore }) {
  const { comments, commentsEnabled } = core;

  if (!commentsEnabled || !comments.composerSelection) {
    return null;
  }

  return (
    <CommentComposerPopover
      composerRef={comments.composerRef}
      left={comments.composerLeft}
      top={comments.composerTop}
      initials={comments.initials}
      displayName={comments.displayName}
      currentUser={comments.currentUser}
      currentUserAvatarUrl={comments.currentUserAvatarUrl}
      content={comments.composerContent}
      onChangeContent={comments.setComposerContent}
      isSubmitting={comments.isSubmittingComposer}
      onCancel={comments.closeComposer}
      onSubmit={comments.handleSubmitComposer}
    />
  );
}
