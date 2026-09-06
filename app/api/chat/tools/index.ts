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
import {
  executeJinaScrape,
  executeJinaSearch,
  jinaScrapeTool,
  jinaSearchTool,
} from './jina-tools'

export type WebSearchProvider = 'firecrawl' | 'jina'

/**
 * Resolves which shared web search provider to use.
 * WEB_SEARCH_PROVIDER can force `firecrawl` or `jina` when that key is present.
 * Otherwise prefers Firecrawl, then Jina.
 */
export function resolveWebSearchProvider(): WebSearchProvider | null {
  const preferred = process.env.WEB_SEARCH_PROVIDER?.trim().toLowerCase()
  const hasFirecrawl = Boolean(process.env.FIRECRAWL_API_KEY)
  const hasJina = Boolean(process.env.JINA_API_KEY)

  if (preferred === 'jina') return hasJina ? 'jina' : null
  if (preferred === 'firecrawl') return hasFirecrawl ? 'firecrawl' : null
  if (hasFirecrawl) return 'firecrawl'
  if (hasJina) return 'jina'
  return null
}

const webSearchProvider = resolveWebSearchProvider()

const webSearchTools: Anthropic.Tool[] =
  webSearchProvider === 'jina'
    ? [jinaSearchTool, jinaScrapeTool]
    : webSearchProvider === 'firecrawl'
      ? [firecrawlSearchTool, firecrawlScrapeTool]
      : []

const executeWebSearch =
  webSearchProvider === 'jina' ? executeJinaSearch : executeFirecrawlSearch
const executeWebScrape =
  webSearchProvider === 'jina' ? executeJinaScrape : executeFirecrawlScrape

export type ToolExecutionContext = {
  appBaseUrl?: string
}

// Export all tool definitions - add your project-specific tools here
export const availableTools: Anthropic.Tool[] = [
  notesCreateNoteTool,
  notesListNotesTool,
  notesGetNoteTool,
  notesGetCommentsTool,
  notesUpdateNoteTool,
  notesAddCommentTool,
  notesReplyToCommentTool,
  ...webSearchTools,
]

// Export all execution functions - map tool name to executor
export const toolExecutors: Record<string, (parameters: Record<string, unknown>, context?: ToolExecutionContext) => Promise<{ success: boolean; data?: unknown; error?: string }>> = {
  notes_create_note: executeNotesCreateNote,
  notes_list_notes: executeNotesListNotes,
  notes_get_note: executeNotesGetNote,
  notes_get_comments: executeNotesGetComments,
  notes_update_note: executeNotesUpdateNote,
  notes_add_comment: executeNotesAddComment,
  notes_reply_to_comment: executeNotesReplyToComment,
  ...(webSearchProvider
    ? {
        web_search: executeWebSearch,
        web_scrape: executeWebScrape,
      }
    : {}),
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
  jinaSearchTool,
  jinaScrapeTool,
}
