"use client";

import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
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
import { useEffect, useMemo, useState } from "react";
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
import { CommentComposerPopover } from "@/components/tiptap/comment-composer-popover";
import { CommentsPanel } from "@/components/tiptap/comments-panel";
import type { ThreadVisibilityFilters } from "@/components/tiptap/comment-thread-types";
import { ScrollArea } from "@/components/ui/scroll-area";

const lowlight = createLowlight(common);
const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlock);
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
  showComments,
  onShowCommentsChange,
  commentsDocumentId,
}: TiptapProps) => {
  const commentsEnabled = Boolean(commentsDocumentId);
  const [internalShowComments, setInternalShowComments] = useState(false);
  const [threadFilters, setThreadFilters] = useState<ThreadVisibilityFilters>({
    open: true,
    resolved: false,
  });

  const effectiveShowComments = showComments ?? internalShowComments;
  const setEffectiveShowComments =
    onShowCommentsChange ?? setInternalShowComments;

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

  const commentSelectionHandler = commentsEnabled
    ? handleOpenComposer
    : onRequestCommentFromSelection;

  const extensions = useMemo(
    () => (commentsEnabled ? [commentExtension] : []),
    [commentExtension, commentsEnabled]
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
      TableCell,
      TableHeader,
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

  return (
    <div
      className={
        commentsEnabled
          ? "flex h-full min-h-0 gap-2"
          : "h-full min-h-0"
      }
    >
      <div className="relative border border-border rounded-md bg-card h-full min-h-0 overflow-hidden flex flex-col flex-1 min-w-0">
        <TooltipProvider>
          {showFixedMenu && (
            <div className="sticky top-0 z-10 bg-card/80 backdrop-blur-lg rounded-lg">
              <FixedMenu
                editor={editor}
                {...(commentsEnabled
                  ? {
                      showComments: effectiveShowComments,
                      onShowCommentsChange: setEffectiveShowComments,
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
            <div className="py-2 px-6 prose prose-base dark:prose-invert max-w-none">
              <EditorContent
                editor={editor}
                className="[&_a:hover]:cursor-pointer"
              />
            </div>
          </ScrollArea>
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

      {commentsEnabled ? (
        <div
          className={`flex shrink-0 overflow-hidden transition-[width] duration-200 ease-linear ${effectiveShowComments ? "w-80" : "w-0"}`}
        >
          <CommentsPanel
            showComments={effectiveShowComments}
            isLoadingThreads={isLoadingThreads}
            threads={threads}
            selectedThreadId={selectedThreadId}
            currentUserId={currentUserId}
            currentUserInitials={initials}
            currentUserAvatarUrl={currentUserAvatarUrl}
            replyContent={replyContent}
            onReplyContentChange={setReplyContent}
            onSelectThread={(threadId) => {
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
            threadFilters={threadFilters}
            onThreadFiltersChange={setThreadFilters}
            onCloseComments={() => setEffectiveShowComments(false)}
          />
        </div>
      ) : null}
    </div>
  );
};

export default Tiptap;
