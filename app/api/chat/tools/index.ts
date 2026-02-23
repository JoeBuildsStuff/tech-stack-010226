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

// Export all tool definitions - add your project-specific tools here
export const availableTools: Anthropic.Tool[] = [
  notesCreateNoteTool,
  notesGetNoteTool,
  notesGetCommentsTool,
  notesUpdateNoteTool,
  notesAddCommentTool,
  notesReplyToCommentTool,
]

// Export all execution functions - map tool name to executor
export const toolExecutors: Record<string, (parameters: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>> = {
  notes_create_note: executeNotesCreateNote,
  notes_get_note: executeNotesGetNote,
  notes_get_comments: executeNotesGetComments,
  notes_update_note: executeNotesUpdateNote,
  notes_add_comment: executeNotesAddComment,
  notes_reply_to_comment: executeNotesReplyToComment,
}

// Re-export individual tools for direct access
export {
  notesCreateNoteTool,
  notesGetNoteTool,
  notesGetCommentsTool,
  notesUpdateNoteTool,
  notesAddCommentTool,
  notesReplyToCommentTool,
}
