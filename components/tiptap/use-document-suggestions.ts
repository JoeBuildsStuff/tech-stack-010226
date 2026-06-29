"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  TrackChanges,
  getDocumentSuggestions,
} from "@/components/tiptap/track-changes";
import type {
  DocumentSuggestion,
  SuggestionKind,
  SuggestionRecord,
  SuggestionReply,
} from "@/components/tiptap/suggestion-types";

export type PanelSuggestion = {
  id: string;
  kind: SuggestionKind;
  preview: string;
  from: number;
  createdBy: string | null;
  createdAt: string | null;
  replies: SuggestionReply[];
};

type UseDocumentSuggestionsOptions = {
  documentId?: string;
  suggesting?: boolean;
};

export function useDocumentSuggestions({
  documentId,
  suggesting = false,
}: UseDocumentSuggestionsOptions) {
  const supabase = useMemo(() => createClient(), []);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncedRef = useRef<string>("");

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [docSuggestions, setDocSuggestions] = useState<DocumentSuggestion[]>([]);
  const [records, setRecords] = useState<SuggestionRecord[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<
    string | null
  >(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const currentUserId = currentUser?.id ?? null;
  // The unified review panel sources display name + avatar from the comments
  // hook; here we only need initials for suggestion-card fallbacks.
  const metadata = currentUser?.user_metadata as
    | { full_name?: string; name?: string }
    | undefined;
  const displayName =
    metadata?.full_name?.trim() ||
    metadata?.name?.trim() ||
    currentUser?.email ||
    "User";
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part: string) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "U";

  const trackChangesExtension = useMemo(
    () =>
      TrackChanges.configure({
        onClickSuggestion: (id) => {
          setSelectedSuggestionId(id);
        },
      }),
    []
  );

  const refreshDocSuggestions = useCallback(() => {
    if (!editor) {
      setDocSuggestions([]);
      return;
    }
    setDocSuggestions(getDocumentSuggestions(editor));
  }, [editor]);

  const refreshRecords = useCallback(async () => {
    if (!documentId) {
      setRecords([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/suggestions`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to load suggestions"
        );
      }
      const payload = (await response.json()) as {
        suggestions: SuggestionRecord[];
      };
      setRecords(payload.suggestions);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load suggestions";
      toast.error(message);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [documentId]);

  const syncSuggestions = useCallback(async () => {
    if (!documentId || !editor) {
      return;
    }

    const items = getDocumentSuggestions(editor).map((suggestion) => ({
      id: suggestion.id,
      kind: suggestion.kind,
      preview: suggestion.preview.slice(0, 2000),
    }));

    const serialized = JSON.stringify(items);
    if (serialized === lastSyncedRef.current) {
      return;
    }

    if (items.length === 0) {
      lastSyncedRef.current = serialized;
      return;
    }

    try {
      const response = await fetch(
        `/api/documents/${documentId}/suggestions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to sync suggestions");
      }

      lastSyncedRef.current = serialized;
      await refreshRecords();
    } catch (error) {
      console.error(error);
    }
  }, [documentId, editor, refreshRecords]);

  const queueSuggestionSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      syncTimeoutRef.current = null;
      void syncSuggestions();
    }, 1500);
  }, [syncSuggestions]);

  /** Called from the editor's onUpdate: refresh the live list + debounce the reconcile. */
  const handleEditorUpdate = useCallback(() => {
    refreshDocSuggestions();
    queueSuggestionSync();
  }, [queueSuggestionSync, refreshDocSuggestions]);

  const resolveOnServer = useCallback(
    async (suggestionId: string, status: "accepted" | "rejected") => {
      if (!documentId) {
        return;
      }
      try {
        const response = await fetch(
          `/api/documents/${documentId}/suggestions/${suggestionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }
        );
        if (!response.ok) {
          throw new Error("Failed to update suggestion");
        }
      } catch (error) {
        console.error(error);
      }
    },
    [documentId]
  );

  const handleAcceptSuggestion = useCallback(
    async (suggestionId: string) => {
      if (!editor) {
        return;
      }
      editor.commands.acceptSuggestion(suggestionId);
      lastSyncedRef.current = "";
      refreshDocSuggestions();
      await resolveOnServer(suggestionId, "accepted");
      await refreshRecords();
    },
    [editor, refreshDocSuggestions, refreshRecords, resolveOnServer]
  );

  const handleRejectSuggestion = useCallback(
    async (suggestionId: string) => {
      if (!editor) {
        return;
      }
      editor.commands.rejectSuggestion(suggestionId);
      lastSyncedRef.current = "";
      refreshDocSuggestions();
      await resolveOnServer(suggestionId, "rejected");
      await refreshRecords();
    },
    [editor, refreshDocSuggestions, refreshRecords, resolveOnServer]
  );

  // Merge live document ranges (open set, source of truth for content/position)
  // with table rows (author/timestamp identity).
  const suggestions = useMemo<PanelSuggestion[]>(() => {
    const recordsById = new Map(records.map((record) => [record.id, record]));
    return docSuggestions.map((suggestion) => {
      const record = recordsById.get(suggestion.id);
      return {
        id: suggestion.id,
        kind: suggestion.kind,
        preview: suggestion.preview,
        from: suggestion.from,
        createdBy: record?.createdBy ?? null,
        createdAt: record?.createdAt ?? null,
        replies: record?.replies ?? [],
      };
    });
  }, [docSuggestions, records]);

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

  // Push the current user id into the plugin so new marks are attributed.
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.commands.setSuggestionUser(currentUserId);
  }, [editor, currentUserId]);

  // Keep the plugin's suggesting flag in sync with local state.
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.commands.setSuggestingMode(suggesting);
  }, [editor, suggesting]);

  // Initial load: records + live doc suggestions.
  useEffect(() => {
    if (!documentId) {
      setRecords([]);
      return;
    }
    void refreshRecords();
  }, [documentId, refreshRecords]);

  useEffect(() => {
    refreshDocSuggestions();
  }, [refreshDocSuggestions]);

  // Drive editor selection/highlight from the selected id.
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.commands.selectSuggestion(selectedSuggestionId);
  }, [editor, selectedSuggestionId]);

  // Clear selection if the suggestion is gone.
  useEffect(() => {
    if (
      selectedSuggestionId &&
      !docSuggestions.some((item) => item.id === selectedSuggestionId)
    ) {
      setSelectedSuggestionId(null);
      editor?.commands.selectSuggestion(null);
    }
  }, [docSuggestions, editor, selectedSuggestionId]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, []);

  const handleCreateSuggestionReply = useCallback(
    async (suggestionId: string, content: string): Promise<boolean> => {
      if (!documentId || !editor) {
        return false;
      }

      const live = getDocumentSuggestions(editor).find(
        (item) => item.id === suggestionId
      );
      if (!live) {
        return false;
      }

      try {
        const response = await fetch(
          `/api/documents/${documentId}/suggestions/${suggestionId}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              kind: live.kind,
              preview: live.preview.slice(0, 2000),
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to add reply");
        }

        // A reply may have created the mirror row; resync so it is not duplicated.
        lastSyncedRef.current = "";
        await refreshRecords();
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to add reply";
        toast.error(message);
        return false;
      }
    },
    [documentId, editor, refreshRecords]
  );

  const handleUpdateSuggestionReply = useCallback(
    async (
      suggestionId: string,
      replyId: string,
      content: string
    ): Promise<boolean> => {
      if (!documentId) {
        return false;
      }

      try {
        const response = await fetch(
          `/api/documents/${documentId}/suggestions/${suggestionId}/comments/${replyId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update reply");
        }

        await refreshRecords();
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update reply";
        toast.error(message);
        return false;
      }
    },
    [documentId, refreshRecords]
  );

  const handleDeleteSuggestionReply = useCallback(
    async (suggestionId: string, replyId: string): Promise<void> => {
      if (!documentId) {
        return;
      }

      try {
        const response = await fetch(
          `/api/documents/${documentId}/suggestions/${suggestionId}/comments/${replyId}`,
          { method: "DELETE" }
        );

        if (!response.ok) {
          throw new Error("Failed to delete reply");
        }

        await refreshRecords();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete reply";
        toast.error(message);
      }
    },
    [documentId, refreshRecords]
  );

  const handleSelectSuggestion = useCallback(
    (suggestionId: string) => {
      setSelectedSuggestionId(suggestionId);
      editor?.commands.selectSuggestion(suggestionId);
      editor?.commands.focusSuggestion(suggestionId);
    },
    [editor]
  );

  const handleHoverSuggestion = useCallback(
    (suggestionId: string | null) => {
      editor?.commands.hoverSuggestion(suggestionId);
    },
    [editor]
  );

  return {
    setEditor,
    trackChangesExtension,
    handleEditorUpdate,
    currentUserId,
    initials,
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
  };
}
