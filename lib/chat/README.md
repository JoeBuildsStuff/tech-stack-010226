# Chat ownership and persistence

The database owns conversation history and branch selection. Zustand holds the current account's in-memory views, request state and UI preferences. Transcripts are never stored in localStorage.

## Code boundaries

- `components/chat/chat-provider.tsx` verifies authentication and resets chat state on account changes.
- `lib/chat/chat-store.ts` holds session views and request IDs. Account epochs invalidate asynchronous work from an earlier login.
- `hooks/use-chat.tsx` coordinates a turn using an immutable account/session/request snapshot. Switching tabs does not redirect a response; Stop cancels only the selected session.
- `lib/chat/client/` owns cancellation, provider transport and SSE decoding.
- `actions/chat.ts` exposes authenticated server actions.
- `lib/chat/server/conversation-service.ts` maps database records, signs attachment URLs and calls transactional PostgreSQL functions.
- `lib/chat/conversation-graph.ts` derives selected paths and sibling navigation from parent IDs.
- `app/api/chat/*` owns provider-specific generation. Requests include the expected account ID, checked against authenticated identity.

## Durable model

A session selects an `active_leaf_id`. Messages form a parent-linked tree. Editing a user message creates a sibling and preserves the previous continuation. Retrying creates another assistant child of the original user message and retains the saved model, settings and attachments.

A client-generated turn ID makes beginning a turn idempotent. Beginning, completing, failing, selecting branches and clearing history run in database transactions with session ownership checks and row locks. Completion saves the response and tool/action metadata together, and never changes a subsequently selected branch.

The user message and pending assistant exist before generation starts. Provider calls still run in the browser request lifecycle; this is not a background generation worker. Closing the tab can leave a pending turn. The UI exposes retry for interrupted turns, and retry supersedes the old pending turn. Save failures are surfaced instead of reported as successful responses.

## Migration and rollout

Apply `supabase/migrations/20260906174341_durable_chat_turns.sql` before deploying this application version. It adds turn records, status/settings columns, active leaves, ownership policies and transactional functions. Existing flat histories are linked in chronological order. Existing branch data is preserved. No live database migration is performed by the test suite.

Legacy unscoped browser transcripts are discarded rather than assigned to whichever account next signs in. Account-specific browser storage contains only UI preferences and open tab IDs.

## Verification

Run `pnpm test:chat`, `pnpm exec tsc --noEmit` and `pnpm build`.

The request tests exercise real hook/store code with mocked provider and action boundaries, including account changes, concurrent sessions, cancellation and stale history loads. Database tests execute the migrations and functions in PGlite PostgreSQL with authenticated roles and RLS. They cover legacy histories, branching, idempotence, atomic rollback, terminal states, clearing and cross-account access. They do not replace a deployed Supabase integration test or a live provider smoke test.
