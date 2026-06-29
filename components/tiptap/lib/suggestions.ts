import type { SupabaseClient } from "@supabase/supabase-js"

import { APP_SCHEMA } from "@/lib/supabase/app-schema"
import { createClient } from "@/lib/supabase/server"
import type {
  SuggestionKind,
  SuggestionRecord,
  SuggestionReply,
  SuggestionStatus,
} from "@/components/tiptap/suggestion-types"

type SuggestionRow = {
  id: string
  document_id: string
  created_by: string
  kind: SuggestionKind
  status: SuggestionStatus
  preview: string
  created_at: string
  updated_at: string
  resolved_at: string | null
}

type SuggestionCommentRow = {
  id: string
  suggestion_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

function stripRichText(content: string) {
  return content.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim()
}

function mapReply(row: SuggestionCommentRow): SuggestionReply {
  return {
    id: row.id,
    suggestionId: row.suggestion_id,
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function assertDocumentOwnership(
  supabase: SupabaseClient,
  documentId: string,
  userId: string
) {
  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("notes")
    .select("id")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) {
    throw new Error("Document not found")
  }
}

function mapSuggestion(
  row: SuggestionRow,
  replies: SuggestionReply[] = []
): SuggestionRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    createdBy: row.created_by,
    kind: row.kind,
    status: row.status,
    preview: row.preview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    replies,
  }
}

export async function listSuggestions(
  documentId: string,
  userId: string
): Promise<SuggestionRecord[]> {
  const supabase = await createClient()
  await assertDocumentOwnership(supabase, documentId, userId)

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("note_suggestions")
    .select("*")
    .eq("document_id", documentId)
    .eq("status", "open")
    .order("created_at", { ascending: true })

  if (error) {
    throw error
  }

  const rows = (data ?? []) as SuggestionRow[]
  if (rows.length === 0) {
    return []
  }

  const { data: replyRows, error: replyError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .select("id, suggestion_id, user_id, content, created_at, updated_at")
    .in(
      "suggestion_id",
      rows.map((row) => row.id)
    )
    .order("created_at", { ascending: true })

  if (replyError) {
    throw replyError
  }

  const repliesBySuggestion = new Map<string, SuggestionReply[]>()
  for (const reply of ((replyRows ?? []) as SuggestionCommentRow[]).map(
    mapReply
  )) {
    const existing = repliesBySuggestion.get(reply.suggestionId) ?? []
    existing.push(reply)
    repliesBySuggestion.set(reply.suggestionId, existing)
  }

  return rows.map((row) =>
    mapSuggestion(row, repliesBySuggestion.get(row.id) ?? [])
  )
}

export async function reconcileSuggestions(input: {
  documentId: string
  userId: string
  items: Array<{ id: string; kind: SuggestionKind; preview: string }>
}): Promise<void> {
  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { error } = await supabase
    .schema(APP_SCHEMA)
    .rpc("reconcile_note_suggestions", {
      p_document_id: input.documentId,
      p_items: input.items,
      p_now: new Date().toISOString(),
    })

  if (error) {
    throw error
  }
}

export async function resolveSuggestion(input: {
  documentId: string
  suggestionId: string
  userId: string
  status: Exclude<SuggestionStatus, "open">
}): Promise<SuggestionRecord> {
  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { data: existing, error: existingError } = await supabase
    .schema(APP_SCHEMA)
    .from("note_suggestions")
    .select("id")
    .eq("id", input.suggestionId)
    .eq("document_id", input.documentId)
    .maybeSingle()

  if (existingError || !existing) {
    throw new Error("Suggestion not found")
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .schema(APP_SCHEMA)
    .from("note_suggestions")
    .update({
      status: input.status,
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", input.suggestionId)
    .eq("document_id", input.documentId)
    .select("*")
    .single()

  if (updateError || !updated) {
    throw updateError ?? new Error("Failed to update suggestion")
  }

  return mapSuggestion(updated as SuggestionRow)
}

/**
 * Ensure a `note_suggestions` row exists for a live mark before attaching a reply.
 * New marks are reconciled on a debounce, so a reply can race ahead of that sync;
 * this upserts the row (no-op if it already exists) so the FK target is present.
 */
async function ensureSuggestionRow(
  supabase: SupabaseClient,
  input: {
    documentId: string
    suggestionId: string
    userId: string
    kind: SuggestionKind
    preview: string
  }
) {
  const { error } = await supabase
    .schema(APP_SCHEMA)
    .from("note_suggestions")
    .upsert(
      {
        id: input.suggestionId,
        document_id: input.documentId,
        created_by: input.userId,
        kind: input.kind,
        preview: input.preview.slice(0, 2000),
      },
      { onConflict: "id", ignoreDuplicates: true }
    )

  if (error) {
    throw error
  }
}

export async function createSuggestionReply(input: {
  documentId: string
  suggestionId: string
  userId: string
  content: string
  kind: SuggestionKind
  preview: string
}): Promise<SuggestionReply> {
  if (stripRichText(input.content).length === 0) {
    throw new Error("Comment content is required")
  }

  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)
  await ensureSuggestionRow(supabase, input)

  const now = new Date().toISOString()
  const { data: reply, error: replyError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .insert({
      suggestion_id: input.suggestionId,
      user_id: input.userId,
      content: input.content,
      created_at: now,
      updated_at: now,
    })
    .select("id, suggestion_id, user_id, content, created_at, updated_at")
    .single()

  if (replyError || !reply) {
    throw replyError ?? new Error("Failed to create reply")
  }

  await supabase
    .schema(APP_SCHEMA)
    .from("note_suggestions")
    .update({ updated_at: now })
    .eq("id", input.suggestionId)
    .eq("document_id", input.documentId)

  return mapReply(reply as SuggestionCommentRow)
}

export async function updateSuggestionReply(input: {
  documentId: string
  suggestionId: string
  replyId: string
  userId: string
  content: string
}): Promise<SuggestionReply> {
  if (stripRichText(input.content).length === 0) {
    throw new Error("Comment content is required")
  }

  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { data: existing, error: existingError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .select("id, user_id")
    .eq("id", input.replyId)
    .eq("suggestion_id", input.suggestionId)
    .maybeSingle()

  if (existingError || !existing) {
    throw new Error("Comment not found")
  }

  if ((existing as { user_id: string }).user_id !== input.userId) {
    throw new Error("Forbidden")
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .update({ content: input.content, updated_at: now })
    .eq("id", input.replyId)
    .eq("suggestion_id", input.suggestionId)
    .eq("user_id", input.userId)
    .select("id, suggestion_id, user_id, content, created_at, updated_at")
    .single()

  if (updateError || !updated) {
    throw updateError ?? new Error("Failed to update reply")
  }

  return mapReply(updated as SuggestionCommentRow)
}

export async function deleteSuggestionReply(input: {
  documentId: string
  suggestionId: string
  replyId: string
  userId: string
}): Promise<void> {
  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { data: existing, error: existingError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .select("id, user_id")
    .eq("id", input.replyId)
    .eq("suggestion_id", input.suggestionId)
    .maybeSingle()

  if (existingError || !existing) {
    throw new Error("Comment not found")
  }

  if ((existing as { user_id: string }).user_id !== input.userId) {
    throw new Error("Forbidden")
  }

  const { error: deleteError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .delete()
    .eq("id", input.replyId)
    .eq("suggestion_id", input.suggestionId)
    .eq("user_id", input.userId)

  if (deleteError) {
    throw deleteError
  }
}
