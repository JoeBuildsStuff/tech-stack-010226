# Chat API

Generation runs on the server, independent of the browser request. These routes start, follow, stop and resume turns; the work itself lives in `lib/chat/server/` (see [lib/chat/README.md](../../../lib/chat/README.md)).

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/chat/turns` | Begin a turn and stream it. JSON body: `sessionId`, `turnId`, `mode` (`new`/`edit`/`retry`), `content`, optional `targetMessageId`, `model`, `settings`, uploaded `attachments`, page `context` and client locale/path. |
| `GET /api/chat/turns/{turnId}/stream` | Re-attach to a turn (another tab, a reload, a dropped connection). Sends a snapshot, then live events. |
| `POST /api/chat/turns/{turnId}/cancel` | Stop a turn wherever it is running. |
| `POST /api/chat/turns/{turnId}/answer` | Answer `ask_user` (`toolCallId`, `output`) and continue the same reply. |
| `POST /api/chat/title` | Generate a session title. |

Every route checks the Supabase user and the `X-Chat-Account-Id` header. Streams are server-sent events whose `data:` lines are JSON `TurnStreamMessage`s (`lib/chat/contracts.ts`): `snapshot`, `event` (thinking, text, tool call, tool result, citations) and `status`. A turn's start stream also opens with a `turn` message carrying the persisted user message and history.

## Providers

The model ID picks the adapter (`lib/chat/server/providers/index.ts`):

| Prefix | Adapter | API |
| --- | --- | --- |
| `gpt-oss-` | `cerebras.ts` | Cerebras Chat Completions |
| `gpt-` | `openai-responses.ts` | OpenAI Responses |
| `grok-` | `openai-responses.ts` | xAI Responses |
| anything else | `anthropic.ts` | Anthropic Messages |

All providers share the system prompt, tools, tool loop (up to 8 model calls; the last must answer) and history. History is the full selected conversation: every message, earlier attachments (images and PDFs natively where supported, text files inlined, other formats described as unreadable) and earlier tool calls with their results.

Reasoning effort is mapped per provider: Anthropic `low`–`max`, OpenAI `none`–`xhigh` (with reasoning summaries streamed as thinking), xAI `low`/`medium`/`high` (default `high`), Cerebras `low`/`medium`/`high`.

## Tools

Tools are defined once with Zod in `lib/chat/tools/definitions.ts`, and server executors live in `lib/chat/server/tools/` (see its README). `ask_user` is a client tool: the turn pauses until the user answers in the UI.

## Environment variables

```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
CEREBRAS_API_KEY=...
XAI_API_KEY=...

# Optional shared web search and scraping for every provider
FIRECRAWL_API_KEY=fc-...
JINA_API_KEY=jina_...
# Optional override when both keys are set: firecrawl | jina
WEB_SEARCH_PROVIDER=

# Claude-native search fallback when no shared provider is configured
WEB_SEARCH_MAX_USES=5
```

## Adding a provider

1. Implement `ChatProvider` in `lib/chat/server/providers/<name>.ts`: convert `CanonicalMessage[]` to the provider's input and stream one model call, returning requested tool calls.
2. Route its model IDs in `providerFor`.
3. Add the models to the chat input's model list.
