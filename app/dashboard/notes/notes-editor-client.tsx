"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDiff, Heart, MessageSquare, Trash } from "lucide-react";
import { EditorContent } from "@tiptap/react";

import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { normalizeNoteIconName, type NoteIconName } from "@/lib/note-icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useRichTextEditor } from "@/components/tiptap/use-rich-text-editor";
import { notesPreset } from "@/components/tiptap/features/presets";
import BubbleMenuComponent from "@/components/tiptap/bubble-menu";
import { SlashCommandMenu } from "@/components/tiptap/slash-command-menu";
import { TableHoverControls } from "@/components/tiptap/table-hover-controls";
import {
  EditorComposer,
  EditorReviewPanel,
} from "@/components/tiptap/editor-review";
import {
  deleteNoteAction,
  setNoteFavoriteAction,
  setNoteIconAction,
  updateNoteContentAction,
} from "./actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NoteIconPicker } from "./note-icon-picker";

// Notion-style document column styling. Layout/typography lives here in the
// page (the editor library stays presentation-agnostic).
const DOCUMENT_EDITOR_CLASSNAME =
  "relative notion-editor prose prose-lg dark:prose-invert max-w-none [&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:outline-none [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h2]:mt-8 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:mt-6 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_p]:my-1 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ol]:my-2";

type NotesEditorClientProps = {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  initialIsFavorite: boolean;
  initialIconName: string;
};

export function NotesEditorClient({
  noteId,
  initialTitle,
  initialContent,
  initialIsFavorite,
  initialIconName,
}: NotesEditorClientProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);
  const [iconName, setIconName] = useState<NoteIconName>(
    normalizeNoteIconName(initialIconName)
  );
  const [isUpdatingIcon, setIsUpdatingIcon] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveDocument = useCallback(
    async (nextContent: string, nextTitle: string) => {
      setSaveState("saving");

      const result = await updateNoteContentAction(
        noteId,
        nextContent,
        nextTitle
      );
      if (!result.success) {
        setSaveState("error");
        return;
      }

      setSaveState("saved");
      window.setTimeout(() => {
        setSaveState((current) => (current === "saved" ? "idle" : current));
      }, 1500);
    },
    [noteId]
  );

  const handleChange = useCallback(
    (nextContent: string) => {
      setContent(nextContent);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        void saveDocument(nextContent, title);
      }, 900);
    },
    [saveDocument, title]
  );

  const handleTitleBlur = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    void saveDocument(content, title);
  }, [content, saveDocument, title]);

  const handleDelete = useCallback(async () => {
    if (isDeleting) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setDeleteError(null);
    setIsDeleting(true);

    const result = await deleteNoteAction(noteId);
    if (!result.success) {
      setDeleteError(result.error || "Delete failed");
      setIsDeleting(false);
      return;
    }

    setDeleteDialogOpen(false);
    window.dispatchEvent(new Event("tech-stack-notes-updated"));
    router.push("/dashboard/notes");
    router.refresh();
  }, [isDeleting, noteId, router]);

  const handleToggleFavorite = useCallback(async () => {
    if (isUpdatingFavorite) {
      return;
    }

    const nextFavoriteState = !isFavorite;
    setIsUpdatingFavorite(true);
    setIsFavorite(nextFavoriteState);

    const result = await setNoteFavoriteAction(noteId, nextFavoriteState);
    if (!result.success) {
      setIsFavorite(!nextFavoriteState);
      setIsUpdatingFavorite(false);
      setSaveState("error");
      return;
    }

    window.dispatchEvent(new Event("tech-stack-notes-updated"));
    setIsUpdatingFavorite(false);
  }, [isFavorite, isUpdatingFavorite, noteId]);

  const handleIconSelect = useCallback(
    async (nextIconName: NoteIconName) => {
      if (isUpdatingIcon || nextIconName === iconName) {
        return;
      }

      const previousIconName = iconName;
      setIsUpdatingIcon(true);
      setIconName(nextIconName);

      const result = await setNoteIconAction(noteId, nextIconName);
      if (!result.success) {
        setIconName(previousIconName);
        setSaveState("error");
        setIsUpdatingIcon(false);
        return;
      }

      window.dispatchEvent(new Event("tech-stack-notes-updated"));
      setIsUpdatingIcon(false);
    },
    [iconName, isUpdatingIcon, noteId]
  );

  useEffect(() => {
    const supabase = createClient();

    void supabase
      .schema(APP_SCHEMA)
      .from("notes")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", noteId);
  }, [noteId]);

  useEffect(() => {
    setIconName(normalizeNoteIconName(initialIconName));
  }, [initialIconName]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const core = useRichTextEditor({
    features: notesPreset,
    context: { documentId: noteId },
    content,
    onChange: handleChange,
    showReview,
    onShowReviewChange: setShowReview,
    suggesting,
    onSuggestingChange: setSuggesting,
  });
  const {
    editor,
    editorContentRef,
    reviewEnabled,
    commentSelectionHandler,
    enabledFeatures,
  } = core;

  const saveStatusLabel = useMemo(() => {
    if (isDeleting) {
      return "Deleting…";
    }
    if (deleteError) {
      return deleteError;
    }
    if (saveState === "saving") {
      return "Saving…";
    }
    if (saveState === "saved") {
      return "Saved";
    }
    if (saveState === "error") {
      return "Save failed";
    }
    return null;
  }, [deleteError, isDeleting, saveState]);

  const pageHeader = (
    <>
      <div className="absolute right-0 top-4 flex items-center gap-1">
        <CopyButton
          textToCopy={content}
          size="icon-sm"
          variant="ghost"
          showTooltip
          tooltipText="Copy note content"
          tooltipCopiedText="Copied!"
          successMessage="Content copied to clipboard"
          className="size-8 p-0 text-muted-foreground hover:text-foreground"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={
            suggesting ? "Turn off suggesting mode" : "Turn on suggesting mode"
          }
          aria-pressed={suggesting}
          className={cn(suggesting && "bg-accent text-accent-foreground")}
          onClick={() => setSuggesting((current) => !current)}
        >
          <FileDiff className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={showReview ? "Hide comments" : "Show comments"}
          aria-pressed={showReview}
          className={cn(showReview && "bg-accent text-accent-foreground")}
          onClick={() => setShowReview((current) => !current)}
        >
          <MessageSquare className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          disabled={isUpdatingFavorite}
          aria-label={isFavorite ? "Unfavorite note" : "Favorite note"}
          aria-pressed={isFavorite}
          className={cn(isFavorite && "bg-accent text-accent-foreground")}
          onClick={() => {
            void handleToggleFavorite();
          }}
        >
          <Heart
            className={cn(
              "size-4",
              isFavorite && "fill-current text-primary-background"
            )}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          disabled={isDeleting}
          aria-label="Delete note"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash className="size-4" />
        </Button>
      </div>

      <NoteIconPicker
        iconName={iconName}
        isUpdating={isUpdatingIcon}
        onSelect={handleIconSelect}
      />

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={handleTitleBlur}
        placeholder="Untitled"
        aria-label="Note title"
        className="mb-1 w-full border-0 bg-transparent text-4xl font-bold leading-tight tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40"
      />

      {saveStatusLabel ? (
        <p className="mb-4 min-h-4 text-xs text-muted-foreground">
          {saveStatusLabel}
        </p>
      ) : (
        <div className="mb-4 min-h-4" />
      )}
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editor ? (
        <div
          className={
            reviewEnabled
              ? `flex h-full min-h-0 ${core.effectiveShowReview ? "gap-1" : "gap-0"}`
              : "h-full min-h-0"
          }
        >
          <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <TooltipProvider>
              <BubbleMenuComponent
                editor={editor}
                enabled={enabledFeatures}
                {...(commentSelectionHandler
                  ? { onRequestCommentFromSelection: commentSelectionHandler }
                  : {})}
              />

              <ScrollArea className="min-h-0 flex-1">
                <div className="group relative mx-auto w-full max-w-[720px] px-6 pb-24 pt-16">
                  {pageHeader}
                  <div ref={editorContentRef} className={DOCUMENT_EDITOR_CLASSNAME}>
                    <EditorContent
                      editor={editor}
                      className="[&_a:hover]:cursor-pointer"
                    />
                    <TableHoverControls
                      editor={editor}
                      containerRef={editorContentRef}
                    />
                  </div>
                </div>
              </ScrollArea>

              <SlashCommandMenu editor={editor} commands={core.slashCommands} />
            </TooltipProvider>

            <EditorComposer core={core} />
          </div>

          {reviewEnabled ? (
            <EditorReviewPanel core={core} editor={editor} />
          ) : null}
        </div>
      ) : (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mx-auto w-full max-w-[720px] px-6 pb-24 pt-16">
            {pageHeader}
            <div className={DOCUMENT_EDITOR_CLASSNAME}>
              <Skeleton className="mb-4 h-6 w-1/3" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="mb-2 h-4 w-3/4" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
