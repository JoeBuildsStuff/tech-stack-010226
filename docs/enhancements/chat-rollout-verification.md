# Chat rollout verification — September 6, 2026

E8 is partially complete. Database rollout and deployed SQL checks are verified; browser, authenticated HTTP/storage, deterministic race interleavings and live-provider coverage remain release prerequisites.

## Target and versions

- Supabase project: `nctejsdfboolawkmgbxi`, matching `.env.local` and the linked CLI project.
- Application schema: `tech_stack_2026`.
- Application source: `f7883e9` plus the permission migration and verification files in this change. The production build passed locally; no application deployment was performed or verified.
- Durable migration: `20260906174341_durable_chat_turns.sql`.
- Permission correction applied remotely: `20260906235033_restrict_chat_turn_rpc_access.sql`.

The durable schema and five RPC bodies were already present before this verification, but the migration history entry was absent. Each deployed function body's MD5 matched the corresponding local SQL body exactly. Live behavior, required columns, RLS, active leaves and private buckets were checked. The missing migration history entry was recorded without replaying the legacy data backfill. The CLI repair attempt could not authenticate with a database password; the equivalent history insert was performed through the authenticated Supabase SQL connector. Both migration versions are now recorded.

## Fixed during verification

All five turn RPCs had direct `anon` EXECUTE grants from hosted default privileges. Revoking `PUBLIC` alone did not remove those grants. The new migration explicitly revokes `PUBLIC, anon`, preserving authenticated execution and security-invoker behavior. Existing account ownership checks already denied anonymous access to conversation data; this correction enforces the intended function-level boundary as well.

The regression suite now reproduces direct default grants to `anon`, applies both migrations, verifies all five function permissions and checks that an anonymous call fails with permission denied.

## Evidence

| Check | Result |
| --- | --- |
| Local chat regression suite | 20 tests passed. |
| TypeScript | `pnpm exec tsc --noEmit` passed. |
| Targeted ESLint | `pnpm exec eslint scripts/chat-database-tests.mjs` passed. |
| Production build | `pnpm build` passed; existing workspace-root and Node deprecation warnings remain. |
| Deployed SQL checks | [Repeatable rollback script](../../scripts/chat-deployed-check.sql) passed on the target project. |
| Account isolation | Two existing auth identities, using `SET LOCAL ROLE authenticated` and distinct `auth.uid()` claims. Session, message and turn reads were isolated; cross-account begin and clear were rejected. These are SQL/RLS tests, not real JWT sign-in or HTTP tests. |
| Durable operations | Begin/completion idempotence, invalid metadata rollback, edit/retry settings, late completion preserving branch selection, cross-session branch denial, stop rejecting completion, and clear rejecting late completion passed. |
| Concurrent calls | Two overlapping SQL connector calls used distinct PostgreSQL backend PIDs and the same turn ID. Final state contained one turn and exactly two messages. This does not establish deterministic lock contention or all stop/complete/clear interleavings. |
| Existing graph integrity | No nonempty sessions with a missing active leaf; no cross-session leaf or parent links. |
| Cleanup | Before and after: 104 sessions and 114 messages. No verification fixture sessions remain. PostgreSQL sequences may advance even when fixtures roll back. |
| Storage | Both chat buckets are private. Signed URL and upload/download isolation remain unverified. |

Supabase security advisors were run after the permission migration. The shared project still reports existing findings outside these five RPCs, including mutable search paths in note functions, anonymous-access policy warnings, auth configuration warnings and an available PostgreSQL security update. This is not a clean security audit of the shared project. See the [database advisor reference](https://supabase.com/docs/guides/database/database-linter) and [PostgreSQL upgrade guidance](https://supabase.com/docs/guides/platform/upgrading).

## Rerunning deployed SQL checks

Run the complete `scripts/chat-deployed-check.sql` file through the Supabase SQL connector or an administrator database connection against the intended project. It requires both chat migrations and at least two existing auth identities. It creates only fixture conversations and ends in `ROLLBACK`; an assertion failure aborts the transaction. With psql, use `-v ON_ERROR_STOP=1 -f scripts/chat-deployed-check.sql` so errors cannot be mistaken for a passing final result.

The script neither changes auth users nor calls providers or writes storage objects. Assertions are explicitly enabled. The separate concurrent-call check used a committed fixture session, which was deleted after checking the result.

## Remaining E8 work

- Supply the deployed application URL and two accessible test-account sessions to exercise login/logout, refresh, uploads during account changes, tab switching, Stop, edit/retry, branch reload and clear.
- Verify authenticated API and storage behavior using real account tokens, including signed URLs and ownership denial.
- Add deterministic multi-connection lock/interleaving tests for distinct turn IDs, Stop versus completion, branch selection versus completion, and clear versus completion. The SQL connector overlap check alone is insufficient.
- Smoke-test all four live providers with tools, attachments, provider errors and persistence errors against the deployed application version.

E1 remains the next implementation priority after E8: browser-independent generation requires an explicit server execution/disconnect contract and worker choice.
