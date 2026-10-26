# Chat architecture: remaining enhancements

Updated: October 25, 2026. E1, E2 and most of E4/E5 were completed on the `chat-server-generation` branch; deployed verification (E8) is still open for that work.

This backlog reconciles the initial assessment of `app/api/chat/`, `components/chat/` and their supporting code with the account isolation, request scoping and durable conversation work subsequently implemented. Priorities indicate recommended implementation order. Checkboxes reflect verified completion; partial verification is recorded separately.

For the implemented design, see [chat ownership and persistence](../../lib/chat/README.md).

## Status of the original findings

“Fixed” below means implemented and locally tested, not verified in a deployed environment.

| Original finding | Current status | Remaining work |
| --- | --- | --- |
| 1. Browser cache not isolated by account (P1) | Fixed: verified account boundary, account epochs, reset/cancellation, account-scoped preferences and no browser transcript persistence. | Deployed/browser verification in E8. |
| 2. Requests follow the selected conversation (P1) | Fixed: session/request ownership, scoped updates and cancellation, stale-result guards. | Browser integration coverage in E8. |
| 3. Edit, clear and branch persistence inconsistent (P1) | Fixed: transactional turn operations and one parent-linked conversation graph with a persisted active leaf. | Migration rollout and deployed verification in E8. |
| 4. Save failures silently treated as success (P1) | Core fix implemented: checked action results, idempotent turn IDs, atomic completion metadata, visible terminal failures. | Generation and final saving still depend on the browser lifecycle; see E1. |
| 5. Provider conversation loses information (P2) | Partly fixed: current prompt is no longer duplicated; retry uses saved model/settings/attachments. | Historical attachments, tool exchanges and non-image file contents remain incomplete; see E2. |
| 6. Streaming/store overhead and fragility (P2) | Partly fixed: transcript deltas no longer write to localStorage; incomplete SSE termination fails explicitly; old transcript quota path no longer handles persisted transcripts. | Broad subscriptions, state duplication and obsolete local helpers remain; see E5. |
| 7. History hydration erases messages (P2) | Fixed: summaries preserve loaded messages, tabs load canonical history and stale loads cannot overwrite active streaming. | Integration coverage in E8. |
| 8. API validation and incomplete UI integrations (P2) | Still open apart from expected-account checks. | Shared request validation, limits and rate limiting in E3; missing route and placeholders in E6. |

The architectural recommendation is only partly complete: client transport/SSE and server conversation persistence were extracted, and the redundant context-backed `useChat` wrapper was removed. Shared contracts, provider adapters, tool placement and store cleanup remain.

## E1 — Browser-independent generation and recovery (P1)

**Problem:** A pending turn is durable, but generation and completion are coordinated by [use-chat](../../hooks/use-chat.tsx). Closing the tab can leave a pending record and lose an unsaved response. Explicit retry now recovers the interaction; it does not resume or finish the original generation automatically.

- [x] Move generation and final persistence into a server-owned lifecycle keyed by the persisted turn ID. Choose a worker/job mechanism only after defining required execution duration and disconnect behavior. _Done October 25, 2026: `lib/chat/server/turn-runner.ts` runs in-process, kept alive with `after()` up to `maxDuration` (300 s); no external job queue._
- [x] Let the browser observe/reconnect to a turn without owning its completion.
- [x] Define abandoned-turn detection, cancellation and retry semantics. Prevent duplicate execution and repeated tool side effects. _Heartbeat every ≤20 s; `expire_stale_chat_turns` fails turns silent for 90 s. Nothing re-runs a turn automatically, so tools never execute twice; retry is explicit._
- [x] Record failures after disconnect and make their state recoverable when the conversation is reopened.

**Done when:** Closing/reopening a tab during generation exposes a completed or explicitly failed turn without duplicating messages or tool effects. Server restart, timeout and stop-versus-complete behavior have integration coverage.

## E2 — Preserve provider history and attachment meaning (P2)

**Problem:** Correct branch selection and saved retry settings do not guarantee faithful provider input. Provider conversion still reduces historical messages primarily to role/text, and non-image attachments often contribute metadata rather than document contents. The transport also truncates history to ten messages, which can sever relevant context or tool exchanges.

Relevant code: [history](../../lib/chat/server/history.ts), [providers](../../lib/chat/server/providers/).

- [x] Define a canonical history representation for text, attachments, tool calls and tool results, with stable call IDs where required by a provider.
- [x] Convert that representation into each provider's supported input format, retaining valid call/result pairs.
- [x] Resolve historical attachments securely; implement bounded file extraction or native document input for supported formats. _Images and PDFs are sent natively where the provider supports them; text files are inlined (400k characters each)._
- [x] Show an explicit unsupported-format message instead of implying that a filename means the document was read.
- [x] Replace the arbitrary ten-message cut with a documented context-budget policy that preserves coherent exchanges. _By decision the full selected history is sent with no budget; see lib/chat/README.md._

**Done when:** A later turn can answer a question about a previously attached supported document and use a prior tool result. Provider contract tests prove that the new prompt appears once and edit/retry preserve the intended branch and settings.

## E3 — Validate and bound every generation endpoint (P2)

**Problem:** Authentication and expected-account checks are present, but they do not validate the entire request or bound authenticated usage. Provider routes still have separate parsing paths. Upload limits alone do not constrain files sent directly to generation endpoints.

- [ ] Introduce shared runtime request schemas for JSON and multipart inputs: roles, content, context, settings and attachment metadata.
- [ ] Validate provider/model compatibility and supported reasoning/search settings against server-owned configuration.
- [ ] Enforce actual file size/type/count and aggregate request/history limits at the generation boundary, including direct multipart requests.
- [ ] Add application-level per-account rate/concurrency limits and consistent error responses.
- [x] When integrating E1, derive provider history from the owned persisted turn rather than treating client-supplied history as canonical.

**Done when:** Malformed JSON, invalid roles/models/settings, oversized history, forged attachment metadata and excessive requests fail consistently before a provider call. Tests exercise direct endpoint calls as well as UI submissions.

## E4 — Finish responsibility and type placement (P2)

**Problem:** Client transport and server persistence now have dedicated modules, but the provider routes still contain substantial parsing, prompts, tool loops and streaming machinery. Shared message types originate in the client store, the hook imports its attachment type from the composer, and note tools import persistence helpers from component folders.

- [x] Add shared chat contracts outside the client store and UI, including attachment, message, request, response and stream-event definitions.
- [x] Reconcile [types/chat.ts](../../types/chat.ts), [conversation types](../../lib/chat/conversation-types.ts), store types and transport types; remove obsolete context/hook interfaces. _`types/chat.ts` was removed; `lib/chat/contracts.ts` is the single source._
- [x] Move provider conversion and SDK interaction into `lib/chat/server/providers/`, leaving thin authenticated, validated HTTP routes.
- [x] Extract common parsing, response/error envelopes and tool-loop orchestration while retaining genuine provider differences.
- [x] Move [tool registration](../../lib/chat/server/tools/index.ts) and adapters into `lib/chat/server/tools/`.
- [ ] Move reusable note/comment persistence into a domain service used by both the editor and [note tools](../../lib/chat/server/tools/note-tools.ts); server/domain code should not depend on component placement.

**Done when:** Shared contracts can be imported without importing UI/store modules; provider adapters can be tested independently of Next.js requests; HTTP routes contain boundary concerns rather than application orchestration.

## E5 — Reduce store responsibilities and streaming renders (P2)

**Problem:** Removing transcript persistence eliminated per-delta storage writes, but several components still subscribe to the whole store. The store retains local CRUD and quota utilities alongside the durable server-backed path. These APIs invite future callers to bypass persistence.

Relevant code: [store](../../lib/chat/chat-store.ts), [message list](../../components/chat/chat-messages-list.tsx), [composer](../../components/chat/chat-input.tsx), [header](../../components/chat/chat-header.tsx), [history](../../components/chat/chat-history.tsx), [tab hydration](../../components/chat/use-hydrate-open-chat-tabs.ts).

- [x] Replace broad subscriptions with selectors for the fields each component actually renders.
- [x] Remove unused local mutation APIs, legacy quota/storage recovery helpers and duplicate state where safe. Clearly distinguish updating a cached view from persisting a conversation mutation.
- [x] Keep UI preferences separate from transcript/request state and avoid serializing unrelated state during token updates.
- [ ] Profile realistic streaming transcripts; batch rendering updates or virtualize long histories only where measurements justify it.

**Done when:** A delta in session A does not rerender unrelated controls or session B's transcript, transcripts never enter localStorage, and production mutation callers use the durable action path.

## E6 — Finish or remove exposed placeholder features (P2)

**Problem:** [The full-page control](../../components/chat/chat-header.tsx) navigates to `/workspace/chat/{id}`, but that route is absent. [ChatFullPage](../../components/chat/chat-fullpage.tsx) also contains `/workspace` navigation. Vote handlers in [message actions](../../components/chat/chat-message-actions.tsx) remain TODOs.

- [ ] Implement an authenticated conversation page under the actual dashboard route structure, with owned-session loading, refresh/deep-link behavior and correct return navigation; alternatively remove the full-page control until supported.
- [ ] Implement durable feedback with clear success/error behavior, or remove inactive vote controls.
- [ ] Audit other exposed controls for placeholder behavior and choose implementation or removal explicitly.

**Done when:** Every visible control performs its advertised action. Full-page navigation, reload, missing-session and unauthorized-session cases have browser coverage.

## E7 — Update the component documentation (P3)

**Problem:** The new [architecture notes](../../lib/chat/README.md) describe the implementation, but the lengthy [component README](../../components/chat/README.md) still contains obsolete examples and route/storage descriptions beneath a warning.

- [ ] Rewrite the component guide around the current contracts, durable operations and supported layouts.
- [ ] Remove examples using obsolete context APIs, local-only transcript mutations and nonexistent routes.
- [ ] Link to one authoritative architecture document instead of duplicating lifecycle details.

**Done when:** Documented imports, operations and navigation match the repository and no example encourages bypassing server persistence.

## E8 — Roll out and verify beyond local tests (release prerequisite)

This completes the verification limitations identified in the assessment and implementation handoff. Database rollout is verified for the configured project; the remaining release checks are still open. See [September 6 rollout evidence](chat-rollout-verification.md).

- [x] Apply [the durable-turn migration](../../supabase/migrations/20260906174341_durable_chat_turns.sql) in the target environment before releasing the dependent application code; verify existing histories and policy/function availability.
- [ ] Exercise browser account A → logout → account B, token refresh, uploads during account changes, tab switching during streams, Stop, edit/retry, branch reload and clear.
- [ ] Run deployed database/API integration checks for ownership, RLS, storage access and function behavior using distinct accounts.
- [ ] Exercise genuine concurrent requests and transaction interleavings against PostgreSQL; PGlite tests do not establish multi-connection concurrency behavior.
- [ ] Smoke-test each supported live provider, including tools, attachments, cancellation, provider failure and persistence failure.

**Current evidence:** 20 local regression tests, TypeScript, targeted lint and a production build pass. Deployed SQL checks verify durable operations and RLS under two account identities; a concurrent duplicate-turn check used distinct PostgreSQL connections. The hosted permission gap was fixed with an additional migration. Browser, real authenticated HTTP/storage, deterministic race interleavings and live-provider checks remain open. See the [verification report](chat-rollout-verification.md) for exact scope, versions and rerun instructions.

**Done when:** Results are recorded for the actual deployed schema and application version, including the browser scenarios above.

## Additional follow-up discovered during implementation

This was not a separately numbered finding in the original assessment:

- [ ] **Bound and paginate conversation loading.** [The conversation service](../../lib/chat/server/conversation-service.ts) currently loads all message records and related metadata in one query. Ensure histories beyond the API row limit can reconstruct the complete selected path, and avoid signing every attachment in every unselected branch unnecessarily. Verify a conversation larger than the configured row limit and a branch-heavy history.

## Suggested sequence

First complete migration rollout and integration verification (E8). Then address browser-independent generation (E1) and endpoint limits (E3). Establish shared contracts and provider boundaries (E4) while improving history fidelity (E2). Finish store/render cleanup (E5), exposed UI gaps (E6), and documentation (E7). Large-history loading can proceed as a separate bounded improvement.
