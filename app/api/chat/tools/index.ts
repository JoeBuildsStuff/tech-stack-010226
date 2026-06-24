import type { Anthropic } from '@anthropic-ai/sdk'
import {
  notesAddCommentTool,
  notesCreateNoteTool,
  notesGetCommentsTool,
  notesGetNoteTool,
  notesListNotesTool,
  notesReplyToCommentTool,
  notesUpdateNoteTool,
  executeNotesAddComment,
  executeNotesCreateNote,
  executeNotesGetComments,
  executeNotesGetNote,
  executeNotesListNotes,
  executeNotesReplyToComment,
  executeNotesUpdateNote,
} from './note-tools'
import {
  executeFirecrawlScrape,
  executeFirecrawlSearch,
  firecrawlScrapeTool,
  firecrawlSearchTool,
} from './firecrawl-tools'

const firecrawlTools: Anthropic.Tool[] = process.env.FIRECRAWL_API_KEY
  ? [firecrawlSearchTool, firecrawlScrapeTool]
  : []

// Export all tool definitions - add your project-specific tools here
export const availableTools: Anthropic.Tool[] = [
  notesCreateNoteTool,
  notesListNotesTool,
  notesGetNoteTool,
  notesGetCommentsTool,
  notesUpdateNoteTool,
  notesAddCommentTool,
  notesReplyToCommentTool,
  ...firecrawlTools,
]

// Export all execution functions - map tool name to executor
export const toolExecutors: Record<string, (parameters: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>> = {
  notes_create_note: executeNotesCreateNote,
  notes_list_notes: executeNotesListNotes,
  notes_get_note: executeNotesGetNote,
  notes_get_comments: executeNotesGetComments,
  notes_update_note: executeNotesUpdateNote,
  notes_add_comment: executeNotesAddComment,
  notes_reply_to_comment: executeNotesReplyToComment,
  web_search: executeFirecrawlSearch,
  web_scrape: executeFirecrawlScrape,
}

// Re-export individual tools for direct access
export {
  notesCreateNoteTool,
  notesListNotesTool,
  notesGetNoteTool,
  notesGetCommentsTool,
  notesUpdateNoteTool,
  notesAddCommentTool,
  notesReplyToCommentTool,
  firecrawlSearchTool,
  firecrawlScrapeTool,
}
