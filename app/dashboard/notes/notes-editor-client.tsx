"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Tiptap from "@/components/tiptap/tiptap";
import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { createClient } from "@/lib/supabase/client";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { deleteNoteAction } from "./actions";
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

type NotesEditorClientProps = {
  noteId: string;
  initialTitle: string;
  initialContent: string;
};

export function NotesEditorClient({
  noteId,
  initialTitle,
  initialContent,
}: NotesEditorClientProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [showComments, setShowComments] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveDocument = useCallback(
    async (nextContent: string, nextTitle: string) => {
      setSaveState("saving");

      const supabase = createClient();
      const { error } = await supabase
        .schema(APP_SCHEMA)
        .from("notes")
        .update({
          title: nextTitle.trim() || "Untitled",
          content: nextContent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", noteId);

      if (error) {
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
    router.push("/dashboard/notes");
    router.refresh();
  }, [isDeleting, noteId, router]);

  useEffect(() => {
    const supabase = createClient();

    void supabase
      .schema(APP_SCHEMA)
      .from("notes")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", noteId);
  }, [noteId]);

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
          showComments={showComments}
          onShowCommentsChange={setShowComments}
          enableFileNodes
        />
      </div>
    </div>
  );
}
