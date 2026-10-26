# Chat Tools

Model-facing tool definitions (name, description, Zod input schema) live in `lib/chat/tools/definitions.ts`, shared by the server and the UI. This directory holds the server executors.

## Structure

- `index.ts` - Executor map (typed against the definitions), provider tool specs, and `executeTool`, which validates arguments before running
- `note-tools.ts` - Note-specific tools (create/list/read/update note, read/add/reply comments)
- `firecrawl-tools.ts` - Firecrawl `web_search` / `web_scrape` providers
- `jina-tools.ts` - Jina AI `web_search` / `web_scrape` providers
- `README.md` - Documentation

## Enabled Tools

- `notes_create_note`
  - Input: optional `title`, `content`
  - Output: created note record and absolute note URL derived from `NEXT_PUBLIC_URL`
- `notes_list_notes`
  - Input: optional `limit`, `includeNotes`
  - Output: total note count and optionally recent note summaries with absolute note URLs derived from `NEXT_PUBLIC_URL`
- `notes_get_note`
  - Input: `noteId`, optional `maxChars`
  - Output: note title/content metadata and absolute note URL derived from `NEXT_PUBLIC_URL`
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
- `web_search` (enabled when Firecrawl or Jina is configured)
  - Firecrawl input: `query`, optional `limit`, `recency`, and domain filters
  - Jina input: `query`, optional `limit`, and `site`
  - Output: current search results with titles, URLs, and descriptions
- `web_scrape` (enabled when Firecrawl or Jina is configured)
  - Input: public `url`, optional `maxChars`
  - Output: clean Markdown and source metadata

Provider selection:
- Set `FIRECRAWL_API_KEY` and/or `JINA_API_KEY`
- Optional `WEB_SEARCH_PROVIDER=firecrawl|jina` forces one provider when that key exists
- Default preference: Firecrawl, then Jina
- Get a free Jina key at https://jina.ai/?sui=apikey

Note tools enforce Supabase auth and only operate on notes owned by the current user. Web search tools run server-side with bounded inputs and never expose API keys to the client.

- `ask_user` (client tool, no executor)
  - Input: 1-4 `questions`, each with 2-4 `choices`
  - Output: the user's `answers`; the turn pauses until the user answers in the chat UI

## Notes Page Context

The chat client sends its current path with each turn. System prompts include this path, so if the user is on `/dashboard/notes/{id}`, models can infer `noteId` for tool calls.

## Adding New Tools

1. Add a definition to `toolDefinitions` in `lib/chat/tools/definitions.ts`:

```typescript
my_tool: serverTool({
  description: 'Description of what this tool does',
  input: z.object({
    param1: z.string().describe('Description of parameter 1'),
  }),
}),
```

2. Write the executor in this directory. Its input type comes from the schema; its output type is inferred from what it returns, so keep `success` literal:

```typescript
import type { ToolInput } from '@/lib/chat/tools/definitions'

export async function executeMyTool(parameters: ToolInput<'my_tool'>) {
  try {
    const result = await someFunction(parameters.param1)
    return { success: true as const, data: result }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
```

3. Register it in `serverToolExecutors` in `index.ts`. The map is checked against the definitions, so a missing or mistyped executor is a build error.

The UI reads typed calls as `ChatToolCall` (`lib/chat/contracts.ts`): narrowing on `toolCall.name === 'my_tool'` types `toolCall.arguments` and `toolCall.result.data`.

For a tool the user answers in the UI, use `clientTool({ description, input, output })` instead and leave it out of the executor map. The turn pauses in `awaiting_input` when the model calls it; the answer route validates the user's answer against `output`.

## Tool Format

Provider schemas are generated from the Zod definitions as JSON Schema, then shaped for each provider by its adapter in `lib/chat/server/providers/`.
