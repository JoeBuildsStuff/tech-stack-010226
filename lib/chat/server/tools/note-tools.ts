import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

import { APP_SCHEMA } from '@/lib/supabase/app-schema'
import { createClient } from '@/lib/supabase/server'
import { createComment, createThread, listThreads } from '@/components/tiptap/lib/comments'
import { createUniqueSlug, slugToDocumentPath } from '@/app/dashboard/notes/note-path'
import type { ToolInput } from '@/lib/chat/tools/definitions'
import type { ToolExecutionContext } from './index'
const MAX_NOTE_CHARS = 20000
const MAX_COMMENT_CHARS = 4000
const MAX_THREADS = 200
const MAX_LIST_NOTES = 100
const MARKDOWN_HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i
const ALLOWED_TEXT_ALIGN = [/^left$/, /^right$/, /^center$/, /^justify$/]
const NOTE_ALLOWED_TAGS = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  's',
  'u',
  'a',
  'hr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'img',
  'div',
  'span',
]

type OwnedNote = {
  id: string
  title: string | null
  content: string | null
  created_at: string
  updated_at: string
}

type ListedNote = {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return null
  }
  return value
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function truncateText(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false }
  }
  return { text: value.slice(0, maxChars), truncated: true }
}

function stripHtml(content: string): string {
  return content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeHtml(content: string): boolean {
  return MARKDOWN_HTML_TAG_PATTERN.test(content)
}

async function normalizeNoteContent(content: string): Promise<string> {
  const trimmed = content.trim()
  if (!trimmed) {
    return ''
  }

  const renderedHtml = looksLikeHtml(trimmed)
    ? trimmed
    : await marked.parse(trimmed, { gfm: true, breaks: true })

  return sanitizeHtml(renderedHtml, {
    allowedTags: NOTE_ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'class'],
      pre: ['class'],
      code: ['class'],
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      h4: ['style'],
      h5: ['style'],
      h6: ['style'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      div: [
        'class',
        'data-type',
        'data-src',
        'data-filename',
        'data-file-size',
        'data-file-type',
        'data-upload-status',
        'data-preview-type',
      ],
      span: ['class'],
    },
    allowedStyles: {
      p: {
        'text-align': ALLOWED_TEXT_ALIGN,
      },
      h1: {
        'text-align': ALLOWED_TEXT_ALIGN,
      },
      h2: {
        'text-align': ALLOWED_TEXT_ALIGN,
      },
      h3: {
        'text-align': ALLOWED_TEXT_ALIGN,
      },
      h4: {
        'text-align': ALLOWED_TEXT_ALIGN,
      },
      h5: {
        'text-align': ALLOWED_TEXT_ALIGN,
      },
      h6: {
        'text-align': ALLOWED_TEXT_ALIGN,
      },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  })
}

async function getAuthenticatedContext(
  context?: ToolExecutionContext,
): Promise<
  | {
      supabase: Awaited<ReturnType<typeof createClient>>
      userId: string
    }
  | { error: string }
> {
  const supabase = context?.supabase ?? (await createClient())
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { error: 'Unauthorized' }
  }

  return {
    supabase,
    userId: user.id,
  }
}

async function getOwnedNote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  noteId: string,
): Promise<OwnedNote | null> {
  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from('notes')
    .select('id, title, content, created_at, updated_at')
    .eq('id', noteId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as OwnedNote | null) ?? null
}

function getAppBaseUrl(context?: ToolExecutionContext): string | null {
  const rawUrl = context?.appBaseUrl?.trim() || process.env.NEXT_PUBLIC_URL?.trim()
  if (!rawUrl) {
    return null
  }

  const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`

  try {
    const url = new URL(withProtocol)
    return url.toString().replace(/\/+$/, '')
  } catch {
    return rawUrl.replace(/\/+$/, '')
  }
}

function noteUrl(noteId: string, context?: ToolExecutionContext): string {
  const path = `/dashboard/notes/${encodeURIComponent(noteId)}`
  const baseUrl = getAppBaseUrl(context)
  return baseUrl ? `${baseUrl}${path}` : path
}

function safeCommentContent(content: string, maxChars: number) {
  const { text, truncated } = truncateText(content, maxChars)
  return {
    content: text,
    truncated,
    originalLength: content.length,
  }
}

export async function executeNotesListNotes(
  parameters: ToolInput<"notes_list_notes">,
  context?: ToolExecutionContext,
) {
  try {
    const limit = clamp(asPositiveInteger(parameters.limit) ?? 20, 1, MAX_LIST_NOTES)
    const includeNotes =
      typeof parameters.includeNotes === 'boolean' ? parameters.includeNotes : true

    const auth = await getAuthenticatedContext(context)
    if ('error' in auth) {
      return { success: false as const, error: auth.error }
    }

    let query = auth.supabase
      .schema(APP_SCHEMA)
      .from('notes')
      .select('id, title, created_at, updated_at', { count: 'exact' })
      .eq('user_id', auth.userId)
      .order('updated_at', { ascending: false })

    if (includeNotes) {
      query = query.limit(limit)
    } else {
      query = query.limit(0)
    }

    const { data, error, count } = await query

    if (error) {
      return { success: false as const, error: error.message }
    }

    const notes = includeNotes
      ? ((data as ListedNote[] | null) ?? []).map((note) => ({
          id: note.id,
          title: note.title ?? 'Untitled',
          createdAt: note.created_at,
          updatedAt: note.updated_at,
          url: noteUrl(note.id, context),
        }))
      : []

    return {
      success: true as const,
      data: {
        totalNotes: count ?? notes.length,
        returnedNotes: notes.length,
        notes,
      },
    }
  } catch (error) {
    console.error('notes_list_notes execution error:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function executeNotesCreateNote(
  parameters: ToolInput<"notes_create_note">,
  context?: ToolExecutionContext,
) {
  try {
    const auth = await getAuthenticatedContext(context)
    if ('error' in auth) {
      return { success: false as const, error: auth.error }
    }

    const rawTitle = typeof parameters.title === 'string' ? parameters.title.trim() : ''
    const title = rawTitle.length > 0 ? rawTitle : 'My Note'
    const rawContent = typeof parameters.content === 'string' ? parameters.content : ''
    const content = await normalizeNoteContent(rawContent)

    const { data: existingNotes, error: existingError } = await auth.supabase
      .schema(APP_SCHEMA)
      .from('notes')
      .select('document_path')
      .eq('user_id', auth.userId)

    if (existingError) {
      return { success: false as const, error: existingError.message }
    }

    const documentPath = slugToDocumentPath(
      createUniqueSlug(
        title,
        (existingNotes ?? [])
          .map((note) => note.document_path)
          .filter((value): value is string => typeof value === 'string'),
      ),
    )

    const { data: created, error: createError } = await auth.supabase
      .schema(APP_SCHEMA)
      .from('notes')
      .insert({
        user_id: auth.userId,
        title,
        content,
        document_path: documentPath,
        sort_order: (existingNotes?.length ?? 0) + 1,
      })
      .select('id, title, content, created_at, updated_at')
      .single()

    if (createError || !created) {
      return { success: false as const, error: createError?.message ?? 'Failed to create note' }
    }

    return {
      success: true as const,
      data: {
        note: {
          id: created.id,
          title: created.title ?? 'Untitled',
          content: created.content ?? '',
          createdAt: created.created_at,
          updatedAt: created.updated_at,
          url: noteUrl(created.id, context),
        },
      },
    }
  } catch (error) {
    console.error('notes_create_note execution error:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function executeNotesGetNote(
  parameters: ToolInput<"notes_get_note">,
  context?: ToolExecutionContext,
) {
  try {
    const noteId = asString(parameters.noteId)
    if (!noteId) {
      return { success: false as const, error: 'noteId is required' }
    }

    const maxChars = clamp(asPositiveInteger(parameters.maxChars) ?? MAX_NOTE_CHARS, 1, MAX_NOTE_CHARS)

    const auth = await getAuthenticatedContext(context)
    if ('error' in auth) {
      return { success: false as const, error: auth.error }
    }

    const note = await getOwnedNote(auth.supabase, auth.userId, noteId)
    if (!note) {
      return { success: false as const, error: 'Note not found' }
    }

    const content = note.content ?? ''
    const truncated = truncateText(content, maxChars)

    return {
      success: true as const,
      data: {
        note: {
          id: note.id,
          title: note.title ?? 'Untitled',
          content: truncated.text,
          contentTruncated: truncated.truncated,
          originalContentLength: content.length,
          createdAt: note.created_at,
          updatedAt: note.updated_at,
          url: noteUrl(note.id, context),
        },
      },
    }
  } catch (error) {
    console.error('notes_get_note execution error:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function executeNotesGetComments(
  parameters: ToolInput<"notes_get_comments">,
  context?: ToolExecutionContext,
) {
  try {
    const noteId = asString(parameters.noteId)
    if (!noteId) {
      return { success: false as const, error: 'noteId is required' }
    }

    const includeResolved =
      typeof parameters.includeResolved === 'boolean' ? parameters.includeResolved : true
    const limitThreads = clamp(asPositiveInteger(parameters.limitThreads) ?? 50, 1, MAX_THREADS)
    const maxCharsPerComment = clamp(
      asPositiveInteger(parameters.maxCharsPerComment) ?? MAX_COMMENT_CHARS,
      1,
      MAX_COMMENT_CHARS,
    )

    const auth = await getAuthenticatedContext(context)
    if ('error' in auth) {
      return { success: false as const, error: auth.error }
    }

    const note = await getOwnedNote(auth.supabase, auth.userId, noteId)
    if (!note) {
      return { success: false as const, error: 'Note not found' }
    }

    const allThreads = await listThreads(noteId, auth.userId)
    const filteredThreads = includeResolved
      ? allThreads
      : allThreads.filter((thread) => thread.status === 'unresolved')

    const threads = filteredThreads.slice(0, limitThreads).map((thread) => ({
      id: thread.id,
      status: thread.status,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      resolvedAt: thread.resolvedAt,
      anchor: {
        from: thread.anchorFrom,
        to: thread.anchorTo,
        exact: thread.anchorExact,
      },
      comments: thread.comments.map((comment) => ({
        id: comment.id,
        userId: comment.userId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        ...safeCommentContent(comment.content, maxCharsPerComment),
      })),
    }))

    const totalComments = filteredThreads.reduce((sum, thread) => sum + thread.comments.length, 0)

    return {
      success: true as const,
      data: {
        noteId,
        noteTitle: note.title ?? 'Untitled',
        includeResolved,
        totalThreads: filteredThreads.length,
        totalComments,
        returnedThreads: threads.length,
        threads,
        url: noteUrl(noteId, context),
      },
    }
  } catch (error) {
    console.error('notes_get_comments execution error:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function executeNotesUpdateNote(
  parameters: ToolInput<"notes_update_note">,
  context?: ToolExecutionContext,
) {
  try {
    const noteId = asString(parameters.noteId)
    if (!noteId) {
      return { success: false as const, error: 'noteId is required' }
    }

    const titleProvided = typeof parameters.title === 'string'
    const contentProvided = typeof parameters.content === 'string'

    if (!titleProvided && !contentProvided) {
      return { success: false as const, error: 'At least one of title or content must be provided' }
    }

    const auth = await getAuthenticatedContext(context)
    if ('error' in auth) {
      return { success: false as const, error: auth.error }
    }

    const note = await getOwnedNote(auth.supabase, auth.userId, noteId)
    if (!note) {
      return { success: false as const, error: 'Note not found' }
    }

    const payload: {
      title?: string
      content?: string
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (titleProvided) {
      const rawTitle = (parameters.title as string).trim()
      payload.title = rawTitle.length > 0 ? rawTitle : 'Untitled'
    }

    if (contentProvided) {
      payload.content = await normalizeNoteContent(parameters.content as string)
    }

    const { data: updated, error } = await auth.supabase
      .schema(APP_SCHEMA)
      .from('notes')
      .update(payload)
      .eq('id', noteId)
      .eq('user_id', auth.userId)
      .select('id, title, content, created_at, updated_at')
      .single()

    if (error || !updated) {
      return { success: false as const, error: error?.message ?? 'Failed to update note' }
    }

    return {
      success: true as const,
      data: {
        note: {
          id: updated.id,
          title: updated.title ?? 'Untitled',
          content: updated.content ?? '',
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
          url: noteUrl(updated.id, context),
        },
      },
    }
  } catch (error) {
    console.error('notes_update_note execution error:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function executeNotesAddComment(
  parameters: ToolInput<"notes_add_comment">,
  context?: ToolExecutionContext,
) {
  try {
    const noteId = asString(parameters.noteId)
    const content = asString(parameters.content)

    if (!noteId) {
      return { success: false as const, error: 'noteId is required' }
    }
    if (!content) {
      return { success: false as const, error: 'content is required' }
    }

    const auth = await getAuthenticatedContext(context)
    if ('error' in auth) {
      return { success: false as const, error: auth.error }
    }

    const note = await getOwnedNote(auth.supabase, auth.userId, noteId)
    if (!note) {
      return { success: false as const, error: 'Note not found' }
    }

    const plainNote = stripHtml(note.content ?? '')
    const anchorText = asString(parameters.anchorText)

    let anchorFrom: number
    let anchorTo: number
    let anchorExact: string
    let anchorPrefix: string
    let anchorSuffix: string

    if (anchorText) {
      anchorFrom = 1
      const safeAnchorText = anchorText
      anchorTo = Math.max(
        2,
        Math.min(anchorFrom + safeAnchorText.length, plainNote.length + 1 || 2),
      )
      anchorExact = safeAnchorText
      anchorPrefix = ''
      anchorSuffix = plainNote.slice(
        Math.max(0, anchorTo - 1),
        Math.max(0, anchorTo - 1 + 48),
      )
    } else {
      anchorFrom = 1
      anchorTo = 1
      anchorExact = ''
      anchorPrefix = ''
      anchorSuffix = ''
    }

    const thread = await createThread({
      documentId: noteId,
      userId: auth.userId,
      anchorFrom,
      anchorTo,
      anchorExact,
      anchorPrefix,
      anchorSuffix,
      content,
    })

    const rootComment = thread.comments[0]

    return {
      success: true as const,
      data: {
        noteId,
        threadId: thread.id,
        rootCommentId: rootComment?.id ?? null,
        threadStatus: thread.status,
        createdAt: thread.createdAt,
        url: noteUrl(noteId, context),
      },
    }
  } catch (error) {
    console.error('notes_add_comment execution error:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function executeNotesReplyToComment(
  parameters: ToolInput<"notes_reply_to_comment">,
  context?: ToolExecutionContext,
) {
  try {
    const noteId = asString(parameters.noteId)
    const threadId = asString(parameters.threadId)
    const content = asString(parameters.content)

    if (!noteId) {
      return { success: false as const, error: 'noteId is required' }
    }
    if (!threadId) {
      return { success: false as const, error: 'threadId is required' }
    }
    if (!content) {
      return { success: false as const, error: 'content is required' }
    }

    const auth = await getAuthenticatedContext(context)
    if ('error' in auth) {
      return { success: false as const, error: auth.error }
    }

    const note = await getOwnedNote(auth.supabase, auth.userId, noteId)
    if (!note) {
      return { success: false as const, error: 'Note not found' }
    }

    const comment = await createComment({
      documentId: noteId,
      threadId,
      userId: auth.userId,
      content,
    })

    return {
      success: true as const,
      data: {
        noteId,
        threadId,
        commentId: comment.id,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        url: noteUrl(noteId, context),
      },
    }
  } catch (error) {
    console.error('notes_reply_to_comment execution error:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
