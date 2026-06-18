import type { Anthropic } from '@anthropic-ai/sdk'
import {
  notesAddCommentTool,
  notesCreateNoteTool,
  notesGetCommentsTool,
  notesGetNoteTool,
  notesReplyToCommentTool,
  notesUpdateNoteTool,
  executeNotesAddComment,
  executeNotesCreateNote,
  executeNotesGetComments,
  executeNotesGetNote,
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
  notesGetNoteTool,
  notesGetCommentsTool,
  notesUpdateNoteTool,
  notesAddCommentTool,
  notesReplyToCommentTool,
  firecrawlSearchTool,
  firecrawlScrapeTool,
}
