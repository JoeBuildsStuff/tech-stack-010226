"use client";

import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import { mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder, Gapcursor } from "@tiptap/extensions";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table/row";
import { TableCell } from "@tiptap/extension-table/cell";
import { TableHeader } from "@tiptap/extension-table/header";
import { FileNode } from "@/components/tiptap/file-node";
import { createLowlight, common } from "lowlight";
import { useEffect, useMemo, useRef, useState } from "react";
import { TiptapProps } from "./types";
import { Image } from "@tiptap/extension-image";
import { CustomImageView } from "./custom-image-view";
import { deleteFile } from "./supabase-file-manager";

import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Strikethrough,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  ChevronsLeftRight,
  Type,
  AlignLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { CodeBlock } from "@/components/tiptap/code-block";
import FixedMenu from "@/components/tiptap/fixed-menu";
import BubbleMenuComponent from "@/components/tiptap/bubble-menu";
import { createFileHandlerConfig } from "@/components/tiptap/file-handler";
import { useDocumentComments } from "@/components/tiptap/use-document-comments";
import { useDocumentSuggestions } from "@/components/tiptap/use-document-suggestions";
import { CommentComposerPopover } from "@/components/tiptap/comment-composer-popover";
import { ReviewPanel } from "@/components/tiptap/review-panel";
import { InsertionMark, DeletionMark } from "@/components/tiptap/redline-marks";
import type { ReviewFilters, ReviewItem } from "@/components/tiptap/review-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SlashCommandMenu } from "@/components/tiptap/slash-command-menu";
import { TableHoverControls } from "@/components/tiptap/table-hover-controls";

const lowlight = createLowlight(common);
const DEFAULT_SHOW_REVIEW = false;

const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlock);
  },
});

function tableCellAlignmentAttributes() {
  return {
    horizontalAlign: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        element.style.textAlign || element.getAttribute("data-horizontal-align"),
      renderHTML: (attributes: { horizontalAlign?: string | null }) =>
        attributes.horizontalAlign
          ? {
              "data-horizontal-align": attributes.horizontalAlign,
              style: `text-align: ${attributes.horizontalAlign};`,
            }
          : {},
    },
    verticalAlign: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        element.style.verticalAlign || element.getAttribute("data-vertical-align"),
      renderHTML: (attributes: { verticalAlign?: string | null }) =>
        attributes.verticalAlign
          ? {
              "data-vertical-align": attributes.verticalAlign,
              style: `vertical-align: ${attributes.verticalAlign};`,
            }
          : {},
    },
  };
}

function mergeStyleAttributes(
  ...attributeSets: Array<Record<string, unknown> | null | undefined>
) {
  const merged = mergeAttributes(
    ...attributeSets.map((attributes) => {
      if (!attributes) {
        return {};
      }

      const rest = { ...attributes };
      delete rest.style;

      return rest;
    })
  );
  const style = attributeSets
    .map((attributes) => attributes?.style)
    .filter((style): style is string => typeof style === "string" && style.length > 0)
    .join(" ");

  return style ? { ...merged, style } : merged;
}

const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellAlignmentAttributes(),
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "td",
      mergeStyleAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});

const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellAlignmentAttributes(),
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "th",
      mergeStyleAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});

const Tiptap = ({
  content,
  showFixedMenu = true,
  showBubbleMenu = true,
  onChange,
  onFileDrop,
  fileUploadConfig,
  enableFileNodes = true,
  onRequestCommentFromSelection,
  showReview,
  onShowReviewChange,
  commentsDocumentId,
  redlineDocumentId,
}: TiptapProps) => {
  const commentsEnabled = Boolean(commentsDocumentId);
  const redlineEnabled = Boolean(redlineDocumentId);
  const editorContentRef = useRef<HTMLDivElement | null>(null);
  const [internalShowReview, setInternalShowReview] =
    useState(DEFAULT_SHOW_REVIEW);
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>({
    open: true,
    resolved: false,
    suggestions: true,
  });

  const effectiveShowReview = showReview ?? internalShowReview;
  const setEffectiveShowReview = onShowReviewChange ?? setInternalShowReview;

  const threadFilters = useMemo(
    () => ({ open: reviewFilters.open, resolved: reviewFilters.resolved }),
    [reviewFilters.open, reviewFilters.resolved]
  );

  const {
    setEditor: setCommentsEditor,
    commentExtension,
    queueAnchorSync,
    currentUser,
    currentUserId,
    displayName,
    initials,
    currentUserAvatarUrl,
    composerRef,
    composerSelection,
    composerLeft,
    composerTop,
    composerContent,
    setComposerContent,
    isSubmittingComposer,
    closeComposer,
    handleOpenComposer,
    handleSubmitComposer,
    isLoadingThreads,
    threads,
    selectedThreadId,
    setSelectedThreadId,
    replyContent,
    setReplyContent,
    handleCreateReply,
    handleToggleThreadResolved,
    handleDeleteThread,
    handleDeleteComment,
    handleUpdateComment,
  } = useDocumentComments(
    commentsDocumentId
      ? {
          documentId: commentsDocumentId,
          threadFilters,
        }
      : {}
  );

  const {
    setEditor: setSuggestionsEditor,
    trackChangesExtension,
    handleEditorUpdate: handleSuggestionsUpdate,
    suggesting,
    setSuggesting,
    currentUserId: suggestionsUserId,
    initials: suggestionsInitials,
    isLoadingSuggestions,
    suggestions,
    selectedSuggestionId,
    setSelectedSuggestionId,
    handleSelectSuggestion,
    handleHoverSuggestion,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleCreateSuggestionReply,
    handleUpdateSuggestionReply,
    handleDeleteSuggestionReply,
  } = useDocumentSuggestions({
    documentId: redlineDocumentId,
  });

  const commentSelectionHandler = commentsEnabled
    ? handleOpenComposer
    : onRequestCommentFromSelection;

  const extensions = useMemo(
    () => (commentsEnabled ? [commentExtension] : []),
    [commentExtension, commentsEnabled]
  );

  // Redline marks are always registered when redline is enabled so saved
  // suggestions render even with suggesting mode off; interception is gated
  // by the suggesting flag inside the TrackChanges plugin.
  const redlineExtensions = useMemo(
    () =>
      redlineEnabled
        ? [InsertionMark, DeletionMark, trackChangesExtension]
        : [],
    [redlineEnabled, trackChangesExtension]
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: "Write something…",
      }),
      CustomCodeBlock.configure({
        lowlight,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https"],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      AlignedTableCell,
      AlignedTableHeader,
      Gapcursor,
      ...(enableFileNodes
        ? [
            createFileHandlerConfig({
              onFileDrop,
              fileUploadConfig: fileUploadConfig
                ? {
                    supabaseBucket: fileUploadConfig.supabaseBucket,
                    pathPrefix: fileUploadConfig.pathPrefix,
                    maxFileSize: fileUploadConfig.maxFileSize,
                    allowedMimeTypes: fileUploadConfig.allowedMimeTypes,
                  }
                : undefined,
            }),
          ]
        : []),

      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width: {
              default: null,
              parseHTML: (element) => {
                const width = element.getAttribute("width");
                if (!width) return null;
                const parsed = parseInt(width, 10);
                return Number.isNaN(parsed) ? null : parsed;
              },
              renderHTML: (attributes) =>
                attributes.width ? { width: String(attributes.width) } : {},
            },
            height: {
              default: null,
              parseHTML: (element) => {
                const height = element.getAttribute("height");
                if (!height) return null;
                const parsed = parseInt(height, 10);
                return Number.isNaN(parsed) ? null : parsed;
              },
              renderHTML: (attributes) =>
                attributes.height ? { height: String(attributes.height) } : {},
            },
          };
        },
        addNodeView() {
          return ReactNodeViewRenderer(CustomImageView);
        },
      }).configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: "tiptap-image",
        },
      }),
      ...(enableFileNodes ? [FileNode] : []),
      ...extensions,
      ...redlineExtensions,
    ],
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
        queueAnchorSync();
      }

      if (redlineEnabled) {
        handleSuggestionsUpdate();
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

  if (!editor) {
    return (
      <div className="relative border border-border rounded-md bg-card">
        {showFixedMenu && (
          <div className="bg-card rounded-t-md border-b border-border">
            <div className="flex flex-row gap-1 p-2">
              <div className="flex flex-row gap-0.5 w-fit">
                <Button size="sm" variant="secondary" disabled>
                  <Type className="" />
                </Button>
              </div>
              <div className="flex flex-row gap-0.5 w-fit">
                <Button size="sm" variant="secondary" disabled>
                  <AlignLeft className="" />
                </Button>
              </div>
              <div className="flex flex-row gap-0.5 w-fit">
                <Toggle size="sm" disabled>
                  <Bold className="" />
                </Toggle>
                <Toggle size="sm" disabled>
                  <Italic className="" />
                </Toggle>
                <Toggle size="sm" disabled>
                  <Strikethrough className="" />
                </Toggle>
                <Toggle size="sm" disabled>
                  <UnderlineIcon className="" />
                </Toggle>
                <Toggle size="sm" disabled>
                  <ChevronsLeftRight className="" />
                </Toggle>
              </div>
            </div>
          </div>
        )}
        <div className="py-2 px-3 h-full">
          <div className="prose prose-base dark:prose-invert max-w-none">
            <Skeleton className="h-6 w-1/3 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-2" />
          </div>
        </div>
      </div>
    );
  }

  const reviewEnabled = commentsEnabled || redlineEnabled;

  // Merge comment threads and redline suggestions into a single position-sorted
  // feed so they interleave in document order (one unified review column).
  const reviewItems: ReviewItem[] = [
    ...(commentsEnabled
      ? threads
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
      ? suggestions.map((suggestion) => ({
          type: "suggestion" as const,
          id: suggestion.id,
          position: suggestion.from,
          suggestion,
        }))
      : []),
  ].sort((a, b) => a.position - b.position);

  return (
    <div
      className={
        reviewEnabled
          ? `flex h-full min-h-0 ${effectiveShowReview ? "gap-1" : "gap-0"}`
          : "h-full min-h-0"
      }
    >
      <div className="relative border border-border rounded-md bg-card h-full min-h-0 overflow-hidden flex flex-col flex-1 min-w-0">
        <TooltipProvider>
          {showFixedMenu && (
            <div className="sticky top-0 z-10 bg-card/80 backdrop-blur-lg rounded-lg">
              <FixedMenu
                editor={editor}
                {...(reviewEnabled
                  ? {
                      showReview: effectiveShowReview,
                      onShowReviewChange: setEffectiveShowReview,
                    }
                  : {})}
                {...(redlineEnabled
                  ? {
                      suggesting,
                      onSuggestingChange: setSuggesting,
                    }
                  : {})}
              />
            </div>
          )}

          {showBubbleMenu &&
            (commentSelectionHandler ? (
              <BubbleMenuComponent
                editor={editor}
                onRequestCommentFromSelection={commentSelectionHandler}
              />
            ) : (
              <BubbleMenuComponent editor={editor} />
            ))}

          <ScrollArea className="flex-1 min-h-0">
            <div
              ref={editorContentRef}
              className="relative py-2 pl-6 pr-14 pb-10 prose prose-base dark:prose-invert max-w-none"
            >
              <EditorContent
                editor={editor}
                className="[&_a:hover]:cursor-pointer"
              />
              <TableHoverControls
                editor={editor}
                containerRef={editorContentRef}
              />
            </div>
          </ScrollArea>
          <SlashCommandMenu editor={editor} />
        </TooltipProvider>

        {commentsEnabled && composerSelection ? (
          <CommentComposerPopover
            composerRef={composerRef}
            left={composerLeft}
            top={composerTop}
            initials={initials}
            displayName={displayName}
            currentUser={currentUser}
            currentUserAvatarUrl={currentUserAvatarUrl}
            content={composerContent}
            onChangeContent={setComposerContent}
            isSubmitting={isSubmittingComposer}
            onCancel={closeComposer}
            onSubmit={handleSubmitComposer}
          />
        ) : null}
      </div>

      {reviewEnabled ? (
        <div
          className={`flex shrink-0 overflow-hidden transition-[width] duration-200 ease-linear ${effectiveShowReview ? "w-80" : "w-0"}`}
        >
          <ReviewPanel
            showReview={effectiveShowReview}
            items={reviewItems}
            isLoading={isLoadingThreads || isLoadingSuggestions}
            currentUserId={currentUserId ?? suggestionsUserId}
            currentUserInitials={initials || suggestionsInitials}
            currentUserAvatarUrl={currentUserAvatarUrl}
            filters={reviewFilters}
            onFiltersChange={setReviewFilters}
            onClose={() => setEffectiveShowReview(false)}
            selectedThreadId={selectedThreadId}
            replyContent={replyContent}
            onReplyContentChange={setReplyContent}
            onSelectThread={(threadId) => {
              setSelectedSuggestionId(null);
              editor.commands.selectSuggestion(null);
              setSelectedThreadId(threadId);
              editor.commands.selectCommentThread(threadId);
              editor.commands.focusCommentThread(threadId);
            }}
            onHoverThread={(threadId) =>
              editor.commands.hoverCommentThread(threadId)
            }
            onCreateReply={handleCreateReply}
            onToggleThreadResolved={handleToggleThreadResolved}
            onDeleteThread={handleDeleteThread}
            onDeleteComment={handleDeleteComment}
            onUpdateComment={handleUpdateComment}
            selectedSuggestionId={selectedSuggestionId}
            onSelectSuggestion={(suggestionId) => {
              setSelectedThreadId(null);
              editor.commands.selectCommentThread(null);
              handleSelectSuggestion(suggestionId);
            }}
            onHoverSuggestion={handleHoverSuggestion}
            onAcceptSuggestion={handleAcceptSuggestion}
            onRejectSuggestion={handleRejectSuggestion}
            onCreateSuggestionReply={handleCreateSuggestionReply}
            onUpdateSuggestionReply={handleUpdateSuggestionReply}
            onDeleteSuggestionReply={handleDeleteSuggestionReply}
          />
        </div>
      ) : null}
    </div>
  );
};

export default Tiptap;
