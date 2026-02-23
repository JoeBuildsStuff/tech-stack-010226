# Chat API Tools

This directory contains tool definitions and execution logic for the chat API.

## Structure

- `index.ts` - Exports all enabled tools and executor mapping
- `note-tools.ts` - Note-specific tools (create/read/update note, read/add/reply comments)
- `template-tool.ts` - Optional template for creating additional tools
- `README.md` - Documentation

## Enabled Tools

- `notes_create_note`
  - Input: optional `title`, `content`
  - Output: created note record and `/dashboard/notes/:id` URL
- `notes_get_note`
  - Input: `noteId`, optional `maxChars`
  - Output: note title/content metadata and `/dashboard/notes/:id` URL
- `notes_get_comments`
  - Input: `noteId`, optional `includeResolved`, `limitThreads`, `maxCharsPerComment`
  - Output: threads with replies, statuses, and anchor summary
- `notes_update_note`
  - Input: `noteId`, and at least one of `title` or `content`
  - Output: updated note record
- `notes_add_comment`
  - Input: `noteId`, `content`, optional `anchorText`
  - Output: created thread ID and root comment ID
- `notes_reply_to_comment`
  - Input: `noteId`, `threadId`, `content`
  - Output: created reply comment metadata

All tools enforce Supabase auth and only operate on notes owned by the current user.

## Notes Page Context

The chat client now sends `client_path` (current URL path) to chat APIs.  
System prompts include this path, so if the user is on `/dashboard/notes/{id}`, models can infer `noteId` for tool calls.

## Adding New Tools

1. Create a file in this directory (example: `my-tool.ts`)
2. Define tool schema + executor:

```typescript
import type { Anthropic } from '@anthropic-ai/sdk'

export const myTool: Anthropic.Tool = {
  name: 'my_tool_name',
  description: 'Description of what this tool does',
  input_schema: {
    type: 'object' as const,
    properties: {
      param1: {
        type: 'string',
        description: 'Description of parameter 1',
      },
    },
    required: ['param1'],
  },
}

export async function executeMyTool(
  parameters: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Your tool logic here
    const result = await someFunction(parameters)
    return { success: true, data: result }
  } catch (error) {
    console.error('My tool execution error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
```

3. Register it in `index.ts`:

```typescript
import { myTool, executeMyTool } from './my-tool'

export const availableTools: Anthropic.Tool[] = [
  notesGetNoteTool,
  myTool,
]

export const toolExecutors: Record<string, ...> = {
  notes_get_note: executeNotesGetNote,
  my_tool_name: executeMyTool,
}
```

## Tool Format

Tools use the Anthropic tool schema format, which is compatible with:
- Anthropic Claude (via `route.ts`)
- OpenAI (converted in `openai/route.ts`)
- Cerebras (converted in `cerebras/route.ts`)

Each tool needs:
1. **Definition** – `name`, `description`, and `input_schema` (JSON Schema)
2. **Executor** – An async function that receives parameters and returns `{ success, data?, error? }`
