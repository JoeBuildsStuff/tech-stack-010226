export type SuggestionKind = "insert" | "delete" | "replace"

export type SuggestionStatus = "open" | "accepted" | "rejected"

/** A suggestion as it currently lives in the document (source of truth for content/position). */
export type DocumentSuggestion = {
  id: string
  kind: SuggestionKind
  from: number
  to: number
  preview: string
}

/** A reply on a suggestion. Mirrors a `comments` row scoped by `suggestion_id`. */
export type SuggestionReply = {
  id: string
  suggestionId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
}

/** A suggestion metadata row mirrored in `note_suggestions` (identity/author/status). */
export type SuggestionRecord = {
  id: string
  documentId: string
  createdBy: string
  kind: SuggestionKind
  status: SuggestionStatus
  preview: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  replies: SuggestionReply[]
}
