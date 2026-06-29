# Tiptap in `tech-stack-010226`

This folder contains the rich-text editor used by the Notes feature at `/dashboard/notes`.

It is not just a generic editor wrapper. In this repo it includes:
- Supabase-backed file upload/render/delete for images and files.
- Inline comment threads anchored to text ranges.
- Redline (tracked-changes) suggestions with accept/reject and replies.
- A single unified **review** side panel that interleaves comments and
  suggestions in document order, plus a comment composer popover.
- API + database integration for comment/suggestion CRUD and anchor sync.

## Where It Is Used

Main integration:
- `app/dashboard/notes/notes-editor-client.tsx`

The notes page passes:
- `content` and `onChange` for autosave.
- `commentsDocumentId={noteId}` to enable built-in comments mode.
- `redlineDocumentId={noteId}` to enable tracked-changes suggestions.
- `showReview` / `onShowReviewChange` to control the unified review panel
  (optional — when omitted, `Tiptap` manages panel visibility internally).
- `enableFileNodes` to allow non-image file nodes.

## Key Files

Core editor:
- `components/tiptap/tiptap.tsx`
- `components/tiptap/types.ts`

Review UI/state (unified comments + suggestions):
- `components/tiptap/review-panel.tsx` (single merged side panel)
- `components/tiptap/review-types.ts` (`ReviewItem`, `ReviewFilters`)
- `components/tiptap/use-document-comments.ts`
- `components/tiptap/use-document-suggestions.ts`
- `components/tiptap/comment-anchors.ts`
- `components/tiptap/comment-composer-popover.tsx`
- `components/tiptap/comment-input-editor.tsx`
- `components/tiptap/comment-thread-types.ts`
- `components/tiptap/suggestion-types.ts`
- `components/tiptap/track-changes.ts` / `components/tiptap/redline-marks.ts`

Files/media:
- `components/tiptap/file-handler.tsx`
- `components/tiptap/file-node.tsx`
- `components/tiptap/file-node-view.tsx`
- `components/tiptap/custom-image-view.tsx`
- `components/tiptap/supabase-file-manager.ts`

Server-side data access:
- `components/tiptap/lib/comments.ts`
- `components/tiptap/lib/suggestions.ts` (suggestion reconcile/resolve + replies)

## Comments Mode (Built-In)

Comments mode is enabled when `commentsDocumentId` is set.

When enabled, `Tiptap` does the following:
1. Mounts `CommentAnchors` extension.
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

`createFileHandlerConfig` intercepts drop/paste and uploads via `uploadFile()` (`supabase-file-manager.ts`).

Current behavior:
- Images insert as Tiptap `image` nodes.
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

## Minimal Usage Example

```tsx
<Tiptap
  content={content}
  onChange={setContent}
  commentsDocumentId={noteId}
  redlineDocumentId={noteId}
  showReview={showReview}
  onShowReviewChange={setShowReview}
  enableFileNodes
/>
```

## Notes for Future Changes

If you change comment payloads, update all three together:
1. `components/tiptap/use-document-comments.ts`
2. `app/api/documents/**` comment routes
3. `components/tiptap/lib/comments.ts`

If you change upload validation defaults, update:
1. `components/tiptap/supabase-file-manager.ts`
2. any caller passing `fileUploadConfig` overrides
