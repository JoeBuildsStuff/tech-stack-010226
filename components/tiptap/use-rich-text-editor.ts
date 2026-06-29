"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";

import {
  featureIdSet,
  hasFeature,
  resolveExtensions,
  resolveSlash,
  type EditorFeature,
  type FeatureContext,
} from "@/components/tiptap/features";
import { useDocumentComments } from "@/components/tiptap/use-document-comments";
import { useDocumentSuggestions } from "@/components/tiptap/use-document-suggestions";
import { InsertionMark, DeletionMark } from "@/components/tiptap/redline-marks";
import { deleteFile } from "@/components/tiptap/supabase-file-manager";
import type { ReviewFilters, ReviewItem } from "@/components/tiptap/review-types";
import type { CommentSelectionPayload } from "@/components/tiptap/types";

const DEFAULT_SHOW_REVIEW = false;

export interface UseRichTextEditorOptions {
  /** Capabilities to enable (compose à la carte or use a preset). */
  features: EditorFeature[];
  /** Per-instance services for feature extensions (documentId, upload…). */
  context?: FeatureContext;
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  /** Fallback comment handler when the built-in comments feature is off. */
  onRequestCommentFromSelection?: (payload: CommentSelectionPayload) => void;
  /** Controlled visibility of the unified review panel. */
  showReview?: boolean;
  onShowReviewChange?: (show: boolean) => void;
  /** Controlled tracked-changes (suggesting) mode. */
  suggesting?: boolean;
  onSuggestingChange?: (suggesting: boolean) => void;
}

/**
 * Headless core for the Tiptap editor. Assembles the schema from a feature set,
 * wires the comments + suggestions backends when those features are present and
 * a `documentId` is supplied, and returns the editor plus the data the chrome
 * (toolbar, bubble menu, slash menu, review panel) needs to render. Consumers
 * own their own layout.
 */
export function useRichTextEditor(options: UseRichTextEditorOptions) {
  const {
    features,
    context = {},
    content,
    onChange,
    placeholder,
    onRequestCommentFromSelection,
    showReview,
    onShowReviewChange,
    suggesting,
    onSuggestingChange,
  } = options;

  const documentId = context.documentId;
  const commentsEnabled = hasFeature(features, "comments") && Boolean(documentId);
  const redlineEnabled =
    hasFeature(features, "suggestions") && Boolean(documentId);

  const editorContentRef = useRef<HTMLDivElement | null>(null);

  const [internalShowReview, setInternalShowReview] =
    useState(DEFAULT_SHOW_REVIEW);
  const [internalSuggesting, setInternalSuggesting] = useState(false);
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>({
    open: true,
    resolved: false,
    suggestions: true,
  });

  const effectiveShowReview = showReview ?? internalShowReview;
  const setEffectiveShowReview = onShowReviewChange ?? setInternalShowReview;
  const effectiveSuggesting = suggesting ?? internalSuggesting;
  const setEffectiveSuggesting = onSuggestingChange ?? setInternalSuggesting;

  const threadFilters = useMemo(
    () => ({ open: reviewFilters.open, resolved: reviewFilters.resolved }),
    [reviewFilters.open, reviewFilters.resolved]
  );

  const comments = useDocumentComments(
    commentsEnabled && documentId
      ? { documentId, threadFilters }
      : {}
  );

  const suggestions = useDocumentSuggestions({
    documentId: redlineEnabled ? documentId : undefined,
    suggesting: effectiveSuggesting,
  });

  const commentSelectionHandler = commentsEnabled
    ? comments.handleOpenComposer
    : onRequestCommentFromSelection;

  const featureExtensions = useMemo(
    () => resolveExtensions(features, context, { placeholder }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [features, placeholder, documentId]
  );

  const commentExtensions = useMemo(
    () => (commentsEnabled ? [comments.commentExtension] : []),
    [commentsEnabled, comments.commentExtension]
  );

  // Redline marks register whenever suggestions are enabled so saved suggestions
  // render even with suggesting mode off; interception is gated inside the
  // TrackChanges plugin by the suggesting flag.
  const redlineExtensions = useMemo(
    () =>
      redlineEnabled
        ? [InsertionMark, DeletionMark, suggestions.trackChangesExtension]
        : [],
    [redlineEnabled, suggestions.trackChangesExtension]
  );

  const editor = useEditor({
    extensions: [...featureExtensions, ...commentExtensions, ...redlineExtensions],
    content: content || "",
    immediatelyRender: false,
    onDelete(params: {
      type: string;
      node?: { type: { name: string }; attrs?: { src?: string } };
      [key: string]: unknown;
    }) {
      const { type, node } = params;
      if (type === "node" && node?.attrs?.src) {
        const src = node.attrs.src;
        if (
          typeof src === "string" &&
          !src.startsWith("http") &&
          !src.startsWith("data:")
        ) {
          deleteFile(src).catch((error: unknown) => {
            console.error("Failed to cleanup deleted file:", error);
          });
        }
      }
    },
    onUpdate: ({ editor }) => {
      if (commentsEnabled) {
        comments.queueAnchorSync();
      }

      if (redlineEnabled) {
        suggestions.handleEditorUpdate();
      }

      if (onChange) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "k") {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });

  const setCommentsEditor = comments.setEditor;
  const setSuggestionsEditor = suggestions.setEditor;

  useEffect(() => {
    if (!commentsEnabled) {
      return;
    }
    setCommentsEditor(editor ?? null);
  }, [commentsEnabled, editor, setCommentsEditor]);

  useEffect(() => {
    if (!redlineEnabled) {
      return;
    }
    setSuggestionsEditor(editor ?? null);
  }, [redlineEnabled, editor, setSuggestionsEditor]);

  useEffect(() => {
    if (editor) {
      const editorContent = editor.getHTML();
      if (content !== editorContent) {
        editor.commands.setContent((content as string) || "", {
          emitUpdate: false,
        });
      }
    }
  }, [content, editor]);

  const reviewEnabled = commentsEnabled || redlineEnabled;

  // Merge comment threads and redline suggestions into a single position-sorted
  // feed so they interleave in document order (one unified review column).
  const reviewItems: ReviewItem[] = useMemo(
    () =>
      [
        ...(commentsEnabled
          ? comments.threads
              .filter((thread) =>
                thread.status === "unresolved"
                  ? reviewFilters.open
                  : reviewFilters.resolved
              )
              .map((thread) => ({
                type: "comment" as const,
                id: thread.id,
                position: thread.anchorFrom,
                thread,
              }))
          : []),
        ...(redlineEnabled && reviewFilters.suggestions
          ? suggestions.suggestions.map((suggestion) => ({
              type: "suggestion" as const,
              id: suggestion.id,
              position: suggestion.from,
              suggestion,
            }))
          : []),
      ].sort((a, b) => a.position - b.position),
    [
      commentsEnabled,
      redlineEnabled,
      comments.threads,
      suggestions.suggestions,
      reviewFilters.open,
      reviewFilters.resolved,
      reviewFilters.suggestions,
    ]
  );

  const enabledFeatures = useMemo(() => featureIdSet(features), [features]);
  const slashCommands = useMemo(() => resolveSlash(features), [features]);

  return {
    editor,
    editorContentRef,
    commentsEnabled,
    redlineEnabled,
    reviewEnabled,
    effectiveShowReview,
    setEffectiveShowReview,
    effectiveSuggesting,
    setEffectiveSuggesting,
    reviewFilters,
    setReviewFilters,
    reviewItems,
    enabledFeatures,
    slashCommands,
    commentSelectionHandler,
    comments,
    suggestions,
  };
}

export type RichTextEditorCore = ReturnType<typeof useRichTextEditor>;
