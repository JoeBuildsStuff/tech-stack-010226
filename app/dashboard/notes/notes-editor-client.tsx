"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Tiptap from "@/components/tiptap/tiptap";
import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { normalizeNoteIconName, type NoteIconName } from "@/lib/note-icons";
import { createClient } from "@/lib/supabase/client";
import { Heart, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { NoteIconPicker } from "./note-icon-picker";

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

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <ButtonGroup className="flex w-full">
        <NoteIconPicker
          iconName={iconName}
          isUpdating={isUpdatingIcon}
          onSelect={handleIconSelect}
        />
        <Input
          size="sm"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Untitled"
          aria-label="Note title"
        />
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={isDeleting}
              aria-label="Delete note"
            >
              <Trash className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete note</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
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
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={isUpdatingFavorite}
          aria-label={isFavorite ? "Unfavorite note" : "Favorite note"}
          onClick={() => {
            void handleToggleFavorite();
          }}
        >
          <Heart
            className={`size-4 ${isFavorite ? "fill-current text-primary-background" : ""}`}
          />
        </Button>
      </ButtonGroup>

      <div className="absolute bottom-2 left-2 px-1 text-xs text-muted-foreground z-10">
        {isDeleting ? "Deleting…" : null}
        {deleteError ? deleteError : null}
        {saveState === "saving" ? "Saving…" : null}
        {saveState === "saved" ? "Saved" : null}
        {saveState === "error" ? "Save failed" : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Tiptap
          content={content}
          onChange={handleChange}
          commentsDocumentId={noteId}
          redlineDocumentId={noteId}
          enableFileNodes
        />
      </div>
    </div>
  );
}
