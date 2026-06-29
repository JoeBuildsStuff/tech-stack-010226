import type { Thread } from "@/components/tiptap/comment-thread-types"
import type { PanelSuggestion } from "@/components/tiptap/use-document-suggestions"

/**
 * A single entry in the unified review feed. Comments and suggestions are merged
 * into one position-sorted column; `position` is the document offset used to
 * interleave them (comment anchor vs. suggestion mark start).
 */
export type ReviewItem =
  | { type: "comment"; id: string; position: number; thread: Thread }
  | { type: "suggestion"; id: string; position: number; suggestion: PanelSuggestion }

export type ReviewFilters = {
  open: boolean
  resolved: boolean
  suggestions: boolean
}
