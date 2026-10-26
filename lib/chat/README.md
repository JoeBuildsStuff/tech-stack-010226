# Chat ownership and persistence

The database owns conversation history and branch selection. The server owns generation. Zustand holds the current account's in-memory views, request state and UI preferences. Transcripts are never stored in localStorage.

## Code boundaries

- `lib/chat/contracts.ts` defines the shared types: messages, ordered parts, typed tool calls, stream events, and runtime parsers for persisted JSON. It imports no UI or store code.
- `lib/chat/tools/definitions.ts` declares every model-facing tool with a Zod input schema. Server tools get their output types from their executors in `lib/chat/server/tools`; client tools (`ask_user`) declare an output schema. Renaming a field breaks the build in the executor and in the UI that reads it.
- `lib/chat/parts.ts` is the pure reducer that folds stream events into ordered parts. The server and the browser both use it, so they build the same sequence.
- `lib/chat/server/turn-runner.ts` runs the shared tool loop for every provider, checkpoints parts to the database, and pauses for client tools.
- `lib/chat/server/providers/` holds one adapter per provider API (Anthropic Messages, OpenAI/xAI Responses, Cerebras Chat Completions). An adapter converts the canonical history and streams one model call; it has no tool loop of its own.
- `lib/chat/server/history.ts` builds the provider-neutral history: every completed message on the selected path, with attachments loaded from storage and tool calls paired with their results.
- `lib/chat/server/conversation-service.ts` maps database rows (validated with Zod), signs attachment URLs and calls the transactional PostgreSQL functions.
- `app/api/chat/turns/*` are thin HTTP routes: start a turn, re-attach to one, cancel one, answer `ask_user`.
- `lib/chat/client/` owns the browser side: SSE decoding, transport and cancellation of this tab's watch.
- `hooks/use-chat.tsx` exposes stable actions (`chatActions`) that subscribe to nothing; components select only the state they render.
- `components/chat/chat-provider.tsx` verifies authentication and resets chat state on account changes.

## Turn lifecycle

1. The browser uploads attachments and POSTs `/api/chat/turns` with a client-generated turn ID. The server begins the turn in one transaction (user message plus pending assistant message), then starts generation and returns an SSE stream.
2. The runner builds the full history from the database: no message cap, earlier attachments re-read from storage, earlier tool calls and results replayed as real call/result pairs when the tool is still offered (as text otherwise).
3. Each model call streams thinking, text and tool calls. Server tools run and their results stream back. Parts are checkpointed every 750 ms with a heartbeat at least every 20 s.
4. When the model calls a client tool (`ask_user`), the turn is checkpointed as `awaiting_input` and generation stops. The UI shows the questions above the composer; answering POSTs `/api/chat/turns/{id}/answer`, which records the result and resumes the same reply. Sending a new message instead completes the paused turn and replays the question as skipped.
5. On completion the reply's parts, text, reasoning, citations and tool calls are saved together.

Generation does not depend on the browser. Closing the tab only closes the stream. Reopening the conversation re-attaches through `/api/chat/turns/{id}/stream`: a turn running in the same server process streams live, and one running elsewhere is followed through its checkpoints. Stop calls `/cancel`, which aborts a local runner or records the stop in the database for a runner on another instance to see at its next checkpoint. A turn whose heartbeat stops for 90 s (restart, crash, timeout) is failed when the conversation is next read, keeping what had streamed.

On Vercel the runner is kept alive with `after()` up to the route's `maxDuration` (300 s). A reply that needs longer is failed at the platform limit and can be retried.

## Durable model

A session selects an `active_leaf_id`. Messages form a parent-linked tree. Editing a user message creates a sibling and preserves the previous continuation. Retrying creates another assistant child of the original user message and retains the saved model, settings and attachments.

A client-generated turn ID makes beginning a turn idempotent; resending it attaches to the existing turn. Beginning, checkpointing, resuming, completing, failing, selecting branches and clearing history run in database transactions with session ownership checks and row locks. Completion never changes a subsequently selected branch.

Assistant replies store their ordered `parts` (thinking, text, tool). Rows written before parts existed are reconstructed as reasoning, tools, then text.

## Migration and rollout

Apply, in order:

- `supabase/migrations/20260906174341_durable_chat_turns.sql`
- `supabase/migrations/20260906235033_restrict_chat_turn_rpc_access.sql`
- `supabase/migrations/20261025120000_server_owned_chat_generation.sql`: parts, turn request metadata, heartbeats, `awaiting_input`, and the progress/resume/expiry functions. It replaces the signatures of `begin_chat_turn`, `complete_chat_turn` and `fail_chat_turn`, so deploy it together with this application version.

Legacy unscoped browser transcripts are discarded rather than assigned to whichever account next signs in. Account-specific browser storage contains only UI preferences and open tab IDs.

## Verification

Run `pnpm test:chat`, `pnpm exec tsc --noEmit` and `pnpm build`.

- `scripts/chat-database-tests.mjs` executes the migrations and functions in PGlite PostgreSQL with authenticated roles and RLS: branching, idempotence, checkpoints, pause/resume, stale expiry, terminal states, clearing and cross-account access.
- `scripts/chat-request-tests.cjs` runs the real hook and store against a mocked transport: account changes, concurrent sessions, server-side Stop, re-attaching, answering `ask_user`, and per-message updates while streaming.
- `scripts/chat-provider-tests.cjs` runs each provider's history conversion and the tool registry: attachments, tool call/result pairing, provider-native tools, and Zod-derived schemas.

They do not replace a deployed Supabase integration test or a live provider smoke test.
