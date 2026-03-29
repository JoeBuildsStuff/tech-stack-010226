"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DEFAULT_NOTE_ICON, isNoteIconName } from "@/lib/note-icons";
import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { createClient } from "@/lib/supabase/server";
import { createUniqueSlug, slugToDocumentPath } from "./note-path";

export async function updateNoteContentAction(
  noteId: string,
  content: string,
  title: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedNoteId = noteId.trim();
  if (!normalizedNoteId) {
    return { success: false, error: "Invalid note ID" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .schema(APP_SCHEMA)
    .from("notes")
    .update({
      title: title.trim() || "Untitled",
      content,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedNoteId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/notes/${encodeURIComponent(normalizedNoteId)}`);
  revalidatePath("/dashboard/notes");
  return { success: true };
}

export async function createNoteAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  const { data: existingNotes, error: existingError } = await supabase
    .schema(APP_SCHEMA)
    .from("notes")
    .select("document_path")
    .eq("user_id", user.id);

  if (existingError) {
    throw existingError;
  }

  const slug = createUniqueSlug(
    "My Note",
    existingNotes?.map((note) => note.document_path) ?? []
  );

  const { data: newNote, error: insertError } = await supabase
    .schema(APP_SCHEMA)
    .from("notes")
    .insert({
      user_id: user.id,
      title: "My Note",
      document_path: slugToDocumentPath(slug),
      sort_order: (existingNotes?.length ?? 0) + 1,
      content: "",
      icon_name: DEFAULT_NOTE_ICON,
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  redirect(`/dashboard/notes/${encodeURIComponent(newNote.id)}`);
}

export async function deleteNoteAction(noteId: string) {
  const normalizedNoteId = noteId.trim();
  if (!normalizedNoteId) {
    return { success: false, error: "Invalid note ID" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .schema(APP_SCHEMA)
    .from("notes")
    .delete()
    .eq("id", normalizedNoteId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/notes");
  return { success: true };
}

export async function setNoteFavoriteAction(
  noteId: string,
  isFavorite: boolean
): Promise<{ success: boolean; error?: string }> {
  const normalizedNoteId = noteId.trim();
  if (!normalizedNoteId) {
    return { success: false, error: "Invalid note ID" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .schema(APP_SCHEMA)
    .from("notes")
    .update({
      is_favorite: isFavorite,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedNoteId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/notes/${encodeURIComponent(normalizedNoteId)}`);
  revalidatePath("/dashboard/notes");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function setNoteIconAction(
  noteId: string,
  iconName: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedNoteId = noteId.trim();
  if (!normalizedNoteId) {
    return { success: false, error: "Invalid note ID" };
  }

  if (!isNoteIconName(iconName)) {
    return { success: false, error: "Invalid icon selection" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .schema(APP_SCHEMA)
    .from("notes")
    .update({
      icon_name: iconName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedNoteId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/notes/${encodeURIComponent(normalizedNoteId)}`);
  revalidatePath("/dashboard/notes");
  revalidatePath("/dashboard");
  return { success: true };
}
