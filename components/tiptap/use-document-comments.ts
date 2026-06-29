"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  CommentAnchors,
  getCommentThreadAnchors,
} from "@/components/tiptap/comment-anchors";
import { isRichTextContentEmpty } from "@/components/tiptap/comment-content-utils";
import type {
  Thread,
  ThreadVisibilityFilters,
} from "@/components/tiptap/comment-thread-types";
import type { CommentSelectionPayload } from "@/components/tiptap/types";

function clampPopoverLeft(left: number, width: number) {
  if (typeof window === "undefined") {
    return left;
  }

  const min = 16 + width / 2;
  const max = window.innerWidth - 16 - width / 2;
  return Math.min(Math.max(left, min), max);
}

type UseDocumentCommentsOptions = {
  documentId?: string;
  threadFilters?: ThreadVisibilityFilters;
};

export function useDocumentComments({
  documentId,
  threadFilters,
}: UseDocumentCommentsOptions) {
  const anchorSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncedAnchorsRef = useRef<string>("");
  const composerRef = useRef<HTMLDivElement | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [composerSelection, setComposerSelection] =
    useState<CommentSelectionPayload | null>(null);
  const [composerLeft, setComposerLeft] = useState(0);
  const [composerTop, setComposerTop] = useState(0);
  const [composerContent, setComposerContent] = useState("");
  const [isSubmittingComposer, setIsSubmittingComposer] = useState(false);

  const currentUserId = currentUser?.id ?? null;
  const metadata = currentUser?.user_metadata as
    | { full_name?: string; name?: string; avatar_url?: string }
    | undefined;
  const displayName =
    metadata?.full_name?.trim() ||
    metadata?.name?.trim() ||
    currentUser?.email ||
    "User";
  const currentUserAvatarUrl = metadata?.avatar_url?.trim() || null;
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part: string) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "U";

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  const refreshThreads = useCallback(async () => {
    if (!documentId) {
      setThreads([]);
      return;
    }

    setIsLoadingThreads(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/threads`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to load comments"
        );
      }

      const payload = (await response.json()) as { threads: Thread[] };
      setThreads(payload.threads);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load comments";
      toast.error(message);
    } finally {
      setIsLoadingThreads(false);
    }
  }, [documentId]);

  const syncThreadAnchors = useCallback(async () => {
    if (!documentId || !editor || threads.length === 0) {
      return;
    }

    const mapped = getCommentThreadAnchors(editor);
    if (mapped.length === 0) {
      return;
    }

    const doc = editor.state.doc;
    const payload = mapped.map((anchor) => {
      const prefixStart = Math.max(1, anchor.anchorFrom - 32);
      const suffixEnd = Math.min(doc.content.size, anchor.anchorTo + 32);

      return {
        id: anchor.id,
        anchorFrom: anchor.anchorFrom,
        anchorTo: anchor.anchorTo,
        anchorExact: doc.textBetween(
          anchor.anchorFrom,
          anchor.anchorTo,
          " ",
          " "
        ),
        anchorPrefix: doc.textBetween(prefixStart, anchor.anchorFrom, " ", " "),
        anchorSuffix: doc.textBetween(anchor.anchorTo, suffixEnd, " ", " "),
      };
    });

    const serialized = JSON.stringify(payload);
    if (serialized === lastSyncedAnchorsRef.current) {
      return;
    }

    try {
      const response = await fetch(
        `/api/documents/${documentId}/threads/anchors`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ anchors: payload }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to sync comment anchors");
      }

      lastSyncedAnchorsRef.current = serialized;
    } catch (error) {
      console.error(error);
    }
  }, [documentId, editor, threads]);

  const queueAnchorSync = useCallback(() => {
    if (anchorSyncTimeoutRef.current) {
      clearTimeout(anchorSyncTimeoutRef.current);
    }

    anchorSyncTimeoutRef.current = setTimeout(() => {
      anchorSyncTimeoutRef.current = null;
      void syncThreadAnchors();
    }, 1500);
  }, [syncThreadAnchors]);

  const createThreadFromSelection = useCallback(
    async (selection: CommentSelectionPayload, content: string) => {
      if (!documentId) {
        throw new Error("Missing document id");
      }

      const response = await fetch(`/api/documents/${documentId}/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          anchorFrom: selection.anchorFrom,
          anchorTo: selection.anchorTo,
          anchorExact: selection.anchorExact,
          anchorPrefix: selection.anchorPrefix,
          anchorSuffix: selection.anchorSuffix,
          content,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to create thread"
        );
      }

      const payload = (await response.json()) as { thread: Thread };
      await refreshThreads();
      setSelectedThreadId(payload.thread.id);
    },
    [documentId, refreshThreads]
  );

  const closeComposer = useCallback(() => {
    setComposerSelection(null);
    setComposerContent("");
  }, []);

  const handleOpenComposer = useCallback(
    (selection: CommentSelectionPayload) => {
      const popoverWidth = 360;
      setComposerSelection(selection);
      setComposerTop(selection.position.top);
      setComposerLeft(clampPopoverLeft(selection.position.left, popoverWidth));
      setComposerContent("");
    },
    []
  );

  const handleSubmitComposer = useCallback(async () => {
    if (!composerSelection) {
      return;
    }

    if (isRichTextContentEmpty(composerContent)) {
      toast.error("Enter a comment before sending");
      return;
    }

    setIsSubmittingComposer(true);

    try {
      await createThreadFromSelection(composerSelection, composerContent);
      closeComposer();
      toast.success("Comment thread created");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create thread";
      toast.error(message);
    } finally {
      setIsSubmittingComposer(false);
    }
  }, [
    closeComposer,
    composerContent,
    composerSelection,
    createThreadFromSelection,
  ]);

  const handleToggleThreadResolved = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (!documentId) {
        return;
      }

      try {
        const response = await fetch(
          `/api/documents/${documentId}/threads/${threadId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ resolved }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update thread");
        }

        await refreshThreads();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update thread";
        toast.error(message);
      }
    },
    [documentId, refreshThreads]
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      if (!documentId) {
        return;
      }

      try {
        const response = await fetch(
          `/api/documents/${documentId}/threads/${threadId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to delete thread");
        }

        if (selectedThreadId === threadId) {
          setSelectedThreadId(null);
          editor?.commands.selectCommentThread(null);
        }

        await refreshThreads();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete thread";
        toast.error(message);
      }
    },
    [documentId, editor, refreshThreads, selectedThreadId]
  );

  const handleCreateReply = useCallback(async () => {
    if (!documentId || !selectedThread) {
      return;
    }

    if (isRichTextContentEmpty(replyContent)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/documents/${documentId}/threads/${selectedThread.id}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: replyContent }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to add reply");
      }

      setReplyContent("");
      await refreshThreads();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add reply";
      toast.error(message);
    }
  }, [documentId, replyContent, refreshThreads, selectedThread]);

  const handleDeleteComment = useCallback(
    async (threadId: string, commentId: string) => {
      if (!documentId) {
        return;
      }

      try {
        const response = await fetch(
          `/api/documents/${documentId}/threads/${threadId}/comments/${commentId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to delete comment");
        }

        await refreshThreads();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete comment";
        toast.error(message);
      }
    },
    [documentId, refreshThreads]
  );

  const handleUpdateComment = useCallback(
    async (threadId: string, commentId: string, content: string) => {
      if (!documentId) {
        return false;
      }

      if (isRichTextContentEmpty(content)) {
        toast.error("Enter a comment before submitting");
        return false;
      }

      try {
        const response = await fetch(
          `/api/documents/${documentId}/threads/${threadId}/comments/${commentId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update comment");
        }

        await refreshThreads();
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update comment";
        toast.error(message);
        return false;
      }
    },
    [documentId, refreshThreads]
  );

  const commentExtension = useMemo(
    () =>
      CommentAnchors.configure({
        onClickThread: (id) => {
          setSelectedThreadId(id);
        },
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setCurrentUser(data.user ?? null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!documentId) {
      setThreads([]);
      return;
    }

    void refreshThreads();
  }, [documentId, refreshThreads]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const visibleThreads = threads.filter((thread) =>
      thread.status === "unresolved"
        ? (threadFilters?.open ?? true)
        : (threadFilters?.resolved ?? true)
    );

    editor.commands.setCommentThreads(
      visibleThreads.map((thread) => ({
        id: thread.id,
        anchorFrom: thread.anchorFrom,
        anchorTo: thread.anchorTo,
        status: thread.status,
      }))
    );

    const serialized = JSON.stringify(
      threads.map((thread) => ({
        id: thread.id,
        anchorFrom: thread.anchorFrom,
        anchorTo: thread.anchorTo,
      }))
    );
    lastSyncedAnchorsRef.current = serialized;
  }, [editor, threadFilters?.open, threadFilters?.resolved, threads]);

  useEffect(() => {
    if (!selectedThreadId || !editor) {
      return;
    }

    editor.commands.selectCommentThread(selectedThreadId);
    editor.commands.focusCommentThread(selectedThreadId);
  }, [editor, selectedThreadId]);

  useEffect(() => {
    if (
      selectedThreadId &&
      !threads.some((thread) => thread.id === selectedThreadId)
    ) {
      setSelectedThreadId(null);
      editor?.commands.selectCommentThread(null);
    }
  }, [editor, selectedThreadId, threads]);

  useEffect(() => {
    if (!editor || !selectedThreadId) {
      return;
    }

    const selectedThread = threads.find((thread) => thread.id === selectedThreadId);
    if (!selectedThread) {
      return;
    }

    const isVisible =
      selectedThread.status === "unresolved"
        ? (threadFilters?.open ?? true)
        : (threadFilters?.resolved ?? true);

    if (!isVisible) {
      setSelectedThreadId(null);
      editor.commands.selectCommentThread(null);
      editor.commands.hoverCommentThread(null);
    }
  }, [editor, selectedThreadId, threadFilters?.open, threadFilters?.resolved, threads]);

  useEffect(() => {
    setReplyContent("");
  }, [selectedThreadId]);

  useEffect(() => {
    if (!composerSelection) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!composerRef.current) {
        return;
      }

      if (composerRef.current.contains(event.target as Node)) {
        return;
      }

      closeComposer();
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      closeComposer();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [closeComposer, composerSelection]);

  useEffect(() => {
    return () => {
      if (anchorSyncTimeoutRef.current) {
        clearTimeout(anchorSyncTimeoutRef.current);
        anchorSyncTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    setEditor,
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
  };
}
