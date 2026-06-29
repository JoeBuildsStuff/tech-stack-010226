# Tiptap in `tech-stack-010226`

This folder contains a **composable** rich-text editor library. The same core
powers everything from a minimal comment box to the full Notes document editor —
you choose capabilities by feature/preset rather than forking the editor.

In this repo it includes:
- Supabase-backed file upload/render/delete for images and files.
- Inline comment threads anchored to text ranges.
- Redline (tracked-changes) suggestions with accept/reject and replies.
- A single unified **review** side panel that interleaves comments and
  suggestions in document order, plus a comment composer popover.
- API + database integration for comment/suggestion CRUD and anchor sync.

## Composable Architecture

A **feature** co-locates the Tiptap extension(s) it needs with the slash commands
it contributes, plus an `id`. Enabling a feature turns on its part of the schema.

The fixed and bubble menus are **not** assembled from per-feature items — that
risks the partial menus drifting from the full-menu styling. Instead `FixedMenu` /
`BubbleMenu` are the canonical, fully-styled components, and each control renders
only when its feature id is in the enabled set. **A partial menu is the full menu
with items hidden, never a restyle.**

```
consumer → preset (or à-la-carte features) → useRichTextEditor → editor + data
                                                   │
                          features resolve to ─────┼── StarterKit config + extensions
                                                   ├── slash commands
                                                   └── enabled feature ids
                                                          └─ gate FixedMenu / BubbleMenu
```

- `features/` — feature modules + the resolver + presets.
  - `types.ts` — `EditorFeature`, `SlashCommand`, `FeatureContext`, `featureIdSet`.
  - `marks.ts`, `blocks.ts`, `media.ts`, `review.ts` — the feature modules.
  - `extensions.ts` — shared node/mark definitions (code block, table cells, image).
  - `resolve.ts` — `resolveExtensions/Slash(features)`. Starts from "everything
    optional off" and lets features turn their pieces back on, so a minimal feature
    set yields a minimal schema. Also disables StarterKit's bundled
    link/underline/codeBlock in favour of the configured standalone versions
    (removing duplicate-extension warnings).
  - `presets.ts` — `comment`, `standard`, `full`, `notes`.
- `use-rich-text-editor.ts` — the **headless core**. Assembles the schema from a
  feature set, wires `useDocumentComments` / `useDocumentSuggestions` when those
  features + a `documentId` are present, and returns the editor, the enabled
  feature ids, slash commands, and review data. Consumers own their own layout.
- `fixed-menu.tsx` / `bubble-menu.tsx` — the canonical menus. Take
  `enabled: Set<string>` (feature ids) and gate each control; default to all-on.
- `rich-text-editor.tsx` — config-driven component for card editors (pick a
  preset, toolbar placement, bubble/slash toggles).
- `editor-review.tsx` — `EditorReviewPanel` + `EditorComposer`, the review-panel
  and composer wiring shared by any review-enabled consumer.

### Presets

| Preset | Features | Typical use |
|--------|----------|-------------|
| `comment` | bold, italic, underline, code | inline comment box |
| `standard` | + headings, lists, link, image | description editor |
| `full` | + tables, code block, quote, divider, align, files | document editor |
| `notes` | full + comments + suggestions | the Notes page |

## Where It Is Used

**Card editors** (config-driven) — pick a preset and render:

```tsx
<RichTextEditor preset="comment" toolbar="bottom" value={value} onChange={setValue} />
<RichTextEditor preset="standard" toolbar="top" content={html} onChange={setHtml} />
<RichTextEditor preset="full" toolbar="top" slashMenu content={html} onChange={setHtml} />
```

There is a live gallery of the three at `app/tiptap-demo/page.tsx` (delete it when
you no longer need it).

**Notes page** (`app/dashboard/notes/notes-editor-client.tsx`) — a review-enabled
document editor uses the headless core directly so the page owns its Notion-style
layout (centered column, in-flow page header, docked review panel):

```tsx
const core = useRichTextEditor({
  features: notesPreset,
  context: { documentId: noteId },
  content,
  onChange: handleChange,
  showReview,
  onShowReviewChange: setShowReview,
  suggesting,
  onSuggestingChange: setSuggesting,
});
// render core.editor + <BubbleMenuComponent /> + <SlashCommandMenu commands={core.slashCommands} />
//        + <EditorComposer core={core} /> + <EditorReviewPanel core={core} editor={core.editor} />
```

> `comment-input-editor.tsx` is still a standalone minimal editor (used by the
> review panel + comment composer in 7 places). It predates this library and is a
> good follow-up candidate to re-back with `RichTextEditor preset="comment"`.

## Comments Mode (Built-In)

Comments mode is enabled when the `comments` feature is present **and** a
`documentId` is supplied via `context`.

When enabled, the core does the following:
1. Mounts the `CommentAnchors` extension (`useDocumentComments`).
2. Loads threads from `GET /api/documents/:id/threads`.
3. Lets user create thread from selection via composer popover.
4. Supports resolve/reopen, thread delete, reply create, comment edit/delete.
5. Debounces anchor updates and syncs to `PATCH /api/documents/:id/threads/anchors`.

Thread creation behavior:
- Thread + root comment are created atomically in one database function call
  (`public.create_note_comment_thread_with_root(...)`), so a thread cannot be created without its first comment.

Anchor sync behavior:
- Triggered from editor updates.
- Debounced (`1500ms`).
- Sends `anchorFrom`, `anchorTo`, and context strings (`anchorExact`, `anchorPrefix`, `anchorSuffix`).
- Persisted in one batched database function call
  (`public.batch_update_note_comment_thread_anchors(...)`) instead of per-anchor update calls.

## File Handling Behavior

The `files` feature mounts `createFileHandlerConfig`, which intercepts drop/paste
and uploads via `uploadFile()` (`supabase-file-manager.ts`).

Current behavior:
- Images insert as Tiptap `image` nodes (the `image` feature).
- Non-images insert as `fileNode` nodes.
- Document-like types (`txt`, `docx`, `pdf`) use `previewType: "document"`; others use `"file"`.
- On node deletion, local Supabase-backed paths are cleaned up via `deleteFile()`.

Current default upload limits/types live in:
- `components/tiptap/supabase-file-manager.ts` (`DEFAULT_OPTIONS`)

## Required API Routes

Comments routes:
- `app/api/documents/[id]/threads/route.ts`
- `app/api/documents/[id]/threads/anchors/route.ts`
- `app/api/documents/[id]/threads/[threadId]/route.ts`
- `app/api/documents/[id]/threads/[threadId]/comments/route.ts`
- `app/api/documents/[id]/threads/[threadId]/comments/[commentId]/route.ts`

Suggestions routes:
- `app/api/documents/[id]/suggestions/route.ts` (list + reconcile)
- `app/api/documents/[id]/suggestions/[suggestionId]/route.ts` (accept/reject)
- `app/api/documents/[id]/suggestions/[suggestionId]/comments/route.ts` (reply create)
- `app/api/documents/[id]/suggestions/[suggestionId]/comments/[commentId]/route.ts` (reply edit/delete)

Comment route auth behavior:
- `PATCH` / `DELETE` on `comments/[commentId]` return `403` when the authenticated user is not the comment author.

File routes expected by `supabase-file-manager.ts`:
- `POST /api/files/upload`
- `GET /api/files/serve`
- `DELETE /api/files/delete`

## Database Dependencies

Comments, suggestions, and notes rely on schema `tech_stack_2026` and tables:
- `notes`
- `comment_threads`
- `comments` (a row belongs to **either** a `thread_id` or a `suggestion_id`)
- `note_suggestions`

Migrations:
- `supabase/migrations/20260222100000_add_comments_tables.sql`
  - Includes RPC functions used by the comments backend:
    - `public.create_note_comment_thread_with_root(...)`
    - `public.batch_update_note_comment_thread_anchors(...)`
- `supabase/migrations/20260627000000_add_note_suggestions.sql`
  - `note_suggestions` table + `reconcile_note_suggestions(...)` RPC.
- `supabase/migrations/20260628120000_add_suggestion_replies.sql`
  - Adds `comments.suggestion_id`, makes `thread_id` nullable, and adds the
    single-parent CHECK + suggestion-scoped RLS policies enabling replies.

Data access logic:
- `components/tiptap/lib/comments.ts`

## Adding a Feature

1. Create an `EditorFeature` (in `features/`): give it an `id`, optional
   `starterKit` overrides, `extensions(ctx)`, and `slash` commands.
2. Add it to the relevant preset(s) in `features/presets.ts`.
3. If the feature needs a fixed/bubble menu control, add it to `FixedMenu` /
   `BubbleMenu` gated by `has("<id>")` — keep the styling identical to the
   neighbouring controls (that's the whole point of the canonical menus).

The resolver folds the extension into the schema and the slash entries into the
menu automatically. (Text color, for example, would be a `TextStyle + Color`
extension, a slash entry, and a gated dropdown in the menus.)

## Notes for Future Changes

If you change comment payloads, update all three together:
1. `components/tiptap/use-document-comments.ts`
2. `app/api/documents/**` comment routes
3. `components/tiptap/lib/comments.ts`

If you change upload validation defaults, update:
1. `components/tiptap/supabase-file-manager.ts`
2. any caller passing `fileUploadConfig` overrides
