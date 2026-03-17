import type { SupabaseClient } from "@supabase/supabase-js"

import { APP_SCHEMA } from "@/lib/supabase/app-schema"
import { createClient } from "@/lib/supabase/server"

export type CommentRecord = {
  id: string
  threadId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
}

export type ThreadRecord = {
  id: string
  documentId: string
  createdBy: string
  status: "unresolved" | "resolved"
  anchorFrom: number
  anchorTo: number
  anchorExact: string
  anchorPrefix: string
  anchorSuffix: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  comments: CommentRecord[]
}

type ThreadRow = {
  id: string
  document_id: string
  created_by: string
  status: "unresolved" | "resolved"
  anchor_from: number
  anchor_to: number
  anchor_exact: string
  anchor_prefix: string
  anchor_suffix: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}

type CommentRow = {
  id: string
  thread_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

type CreateThreadRpcRow = {
  thread_id: string
}

function stripRichText(content: string) {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

async function assertDocumentOwnership(supabase: SupabaseClient, documentId: string, userId: string) {
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

function mapComments(rows: CommentRow[]): CommentRecord[] {
  return rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function mapThread(row: ThreadRow, comments: CommentRecord[]): ThreadRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    createdBy: row.created_by,
    status: row.status,
    anchorFrom: row.anchor_from,
    anchorTo: row.anchor_to,
    anchorExact: row.anchor_exact,
    anchorPrefix: row.anchor_prefix,
    anchorSuffix: row.anchor_suffix,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    comments,
  }
}

async function getThreadById(
  supabase: SupabaseClient,
  documentId: string,
  threadId: string
): Promise<ThreadRecord> {
  const { data: threadRow, error: threadError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .select("*")
    .eq("id", threadId)
    .eq("document_id", documentId)
    .maybeSingle()

  if (threadError || !threadRow) {
    throw new Error("Thread not found")
  }

  const { data: commentRows, error: commentsError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })

  if (commentsError) {
    throw commentsError
  }

  return mapThread(threadRow as ThreadRow, mapComments((commentRows ?? []) as CommentRow[]))
}

export async function listThreads(documentId: string, userId: string): Promise<ThreadRecord[]> {
  const supabase = await createClient()
  await assertDocumentOwnership(supabase, documentId, userId)

  const { data: threadRows, error: threadsError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true })

  if (threadsError) {
    throw threadsError
  }

  const typedThreads = (threadRows ?? []) as ThreadRow[]
  if (typedThreads.length === 0) {
    return []
  }

  const threadIds = typedThreads.map((thread) => thread.id)
  const { data: commentRows, error: commentsError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .select("*")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: true })

  if (commentsError) {
    throw commentsError
  }

  const commentsByThread = new Map<string, CommentRecord[]>()
  for (const comment of mapComments((commentRows ?? []) as CommentRow[])) {
    const existing = commentsByThread.get(comment.threadId) ?? []
    existing.push(comment)
    commentsByThread.set(comment.threadId, existing)
  }

  return typedThreads.map((thread) => mapThread(thread, commentsByThread.get(thread.id) ?? []))
}

export async function createThread(input: {
  documentId: string
  userId: string
  anchorFrom: number
  anchorTo: number
  anchorExact: string
  anchorPrefix: string
  anchorSuffix: string
  content: string
}): Promise<ThreadRecord> {
  if (input.anchorTo <= input.anchorFrom) {
    throw new Error("Invalid anchor range")
  }
  if (stripRichText(input.content).length === 0) {
    throw new Error("Comment content is required")
  }

  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .rpc("create_note_comment_thread_with_root", {
      p_document_id: input.documentId,
      p_anchor_from: input.anchorFrom,
      p_anchor_to: input.anchorTo,
      p_anchor_exact: input.anchorExact,
      p_anchor_prefix: input.anchorPrefix,
      p_anchor_suffix: input.anchorSuffix,
      p_content: input.content,
    })

  if (error || !data) {
    throw error ?? new Error("Failed to create thread")
  }

  const rows = (Array.isArray(data) ? data : [data]) as CreateThreadRpcRow[]
  const threadId = rows[0]?.thread_id
  if (!threadId) {
    throw new Error("Failed to create thread")
  }

  return getThreadById(supabase, input.documentId, threadId)
}

export async function updateThread(
  documentId: string,
  threadId: string,
  userId: string,
  updates: {
    resolved?: boolean
    anchorFrom?: number
    anchorTo?: number
    anchorExact?: string
    anchorPrefix?: string
    anchorSuffix?: string
  }
): Promise<ThreadRecord> {
  const supabase = await createClient()
  await assertDocumentOwnership(supabase, documentId, userId)

  const { data: existingThread, error: existingThreadError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .select("*")
    .eq("id", threadId)
    .eq("document_id", documentId)
    .maybeSingle()

  if (existingThreadError || !existingThread) {
    throw new Error("Thread not found")
  }

  const existing = existingThread as ThreadRow
  const now = new Date().toISOString()
  const resolvedStatus =
    updates.resolved === undefined
      ? existing.status
      : updates.resolved
        ? "resolved"
        : "unresolved"

  const payload = {
    status: resolvedStatus,
    resolved_at: updates.resolved === undefined ? existing.resolved_at : updates.resolved ? now : null,
    anchor_from: updates.anchorFrom ?? existing.anchor_from,
    anchor_to: updates.anchorTo ?? existing.anchor_to,
    anchor_exact: updates.anchorExact ?? existing.anchor_exact,
    anchor_prefix: updates.anchorPrefix ?? existing.anchor_prefix,
    anchor_suffix: updates.anchorSuffix ?? existing.anchor_suffix,
    updated_at: now,
  }

  const { data: updatedThread, error: updateThreadError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .update(payload)
    .eq("id", threadId)
    .eq("document_id", documentId)
    .select("*")
    .single()

  if (updateThreadError || !updatedThread) {
    throw updateThreadError ?? new Error("Failed to update thread")
  }

  const { data: commentRows, error: commentRowsError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })

  if (commentRowsError) {
    throw commentRowsError
  }

  return mapThread(updatedThread as ThreadRow, mapComments((commentRows ?? []) as CommentRow[]))
}

export async function deleteThread(documentId: string, threadId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  await assertDocumentOwnership(supabase, documentId, userId)

  const { data: existing, error: existingError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .select("id")
    .eq("id", threadId)
    .eq("document_id", documentId)
    .maybeSingle()

  if (existingError || !existing) {
    throw new Error("Thread not found")
  }

  const { error } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .delete()
    .eq("id", threadId)
    .eq("document_id", documentId)
  if (error) {
    throw error
  }
}

export async function createComment(input: {
  documentId: string
  threadId: string
  userId: string
  content: string
}): Promise<CommentRecord> {
  if (stripRichText(input.content).length === 0) {
    throw new Error("Comment content is required")
  }

  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { data: thread, error: threadError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .select("id")
    .eq("id", input.threadId)
    .eq("document_id", input.documentId)
    .maybeSingle()

  if (threadError || !thread) {
    throw new Error("Thread not found")
  }

  const now = new Date().toISOString()

  const { data: comment, error: commentError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .insert({
      thread_id: input.threadId,
      user_id: input.userId,
      content: input.content,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()

  if (commentError || !comment) {
    throw commentError ?? new Error("Failed to create comment")
  }

  const { error: threadUpdateError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .update({ updated_at: now })
    .eq("id", input.threadId)

  if (threadUpdateError) {
    throw threadUpdateError
  }

  return mapComments([comment as CommentRow])[0]
}

export async function updateComment(input: {
  documentId: string
  threadId: string
  commentId: string
  userId: string
  content: string
}): Promise<CommentRecord> {
  if (stripRichText(input.content).length === 0) {
    throw new Error("Comment content is required")
  }

  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { data: existing, error: existingError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .select("id, user_id")
    .eq("id", input.commentId)
    .eq("thread_id", input.threadId)
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
    .update({
      content: input.content,
      updated_at: now,
    })
    .eq("id", input.commentId)
    .eq("thread_id", input.threadId)
    .eq("user_id", input.userId)
    .select("*")
    .single()

  if (updateError || !updated) {
    throw updateError ?? new Error("Failed to update comment")
  }

  const { error: threadUpdateError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .update({ updated_at: now })
    .eq("id", input.threadId)

  if (threadUpdateError) {
    throw threadUpdateError
  }

  return mapComments([updated as CommentRow])[0]
}

export async function deleteComment(input: {
  documentId: string
  threadId: string
  commentId: string
  userId: string
}): Promise<void> {
  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { data: existing, error: existingError } = await supabase
    .schema(APP_SCHEMA)
    .from("comments")
    .select("id, user_id")
    .eq("id", input.commentId)
    .eq("thread_id", input.threadId)
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
    .eq("id", input.commentId)
    .eq("thread_id", input.threadId)
    .eq("user_id", input.userId)

  if (deleteError) {
    throw deleteError
  }

  const now = new Date().toISOString()
  const { error: threadUpdateError } = await supabase
    .schema(APP_SCHEMA)
    .from("comment_threads")
    .update({ updated_at: now })
    .eq("id", input.threadId)

  if (threadUpdateError) {
    throw threadUpdateError
  }
}

export async function updateThreadAnchors(input: {
  documentId: string
  userId: string
  anchors: Array<{
    id: string
    anchorFrom: number
    anchorTo: number
    anchorExact?: string
    anchorPrefix?: string
    anchorSuffix?: string
  }>
}): Promise<void> {
  if (input.anchors.length === 0) {
    return
  }

  const supabase = await createClient()
  await assertDocumentOwnership(supabase, input.documentId, input.userId)

  const { error } = await supabase
    .schema(APP_SCHEMA)
    .rpc("batch_update_note_comment_thread_anchors", {
      p_document_id: input.documentId,
      p_anchors: input.anchors,
      p_now: new Date().toISOString(),
    })

  if (error) {
    throw error
  }
}
