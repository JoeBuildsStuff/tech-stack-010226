-- Allow comments to belong to a redline suggestion as well as a comment thread.
-- This unifies the review experience: suggestions (insertions/deletions) can now
-- carry a reply discussion just like comment threads do. The document marks remain
-- the source of truth for suggestion content/position; replies are mirror metadata
-- attached to the note_suggestions row.

-- A comment now belongs to EITHER a thread OR a suggestion (exactly one).
ALTER TABLE tech_stack_2026.comments
  ALTER COLUMN thread_id DROP NOT NULL;

ALTER TABLE tech_stack_2026.comments
  ADD COLUMN IF NOT EXISTS suggestion_id uuid
    REFERENCES tech_stack_2026.note_suggestions(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_single_parent_chk'
      AND conrelid = 'tech_stack_2026.comments'::regclass
  ) THEN
    ALTER TABLE tech_stack_2026.comments
      ADD CONSTRAINT comments_single_parent_chk
      CHECK ((thread_id IS NOT NULL) <> (suggestion_id IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_suggestion_id
  ON tech_stack_2026.comments(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_comments_suggestion_created
  ON tech_stack_2026.comments(suggestion_id, created_at ASC);

-- RLS: the existing comments_owner_* policies authorize thread-scoped rows only
-- (their EXISTS subselect is false when thread_id IS NULL). Add parallel policies
-- that authorize suggestion-scoped rows via note_suggestions -> notes ownership.
-- Permissive policies combine with OR, so this is purely additive.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comments' AND policyname = 'comments_suggestion_owner_select'
  ) THEN
    CREATE POLICY comments_suggestion_owner_select ON tech_stack_2026.comments
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.note_suggestions s
          JOIN tech_stack_2026.notes n ON n.id = s.document_id
          WHERE s.id = comments.suggestion_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comments' AND policyname = 'comments_suggestion_owner_insert'
  ) THEN
    CREATE POLICY comments_suggestion_owner_insert ON tech_stack_2026.comments
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.note_suggestions s
          JOIN tech_stack_2026.notes n ON n.id = s.document_id
          WHERE s.id = comments.suggestion_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comments' AND policyname = 'comments_suggestion_owner_update'
  ) THEN
    CREATE POLICY comments_suggestion_owner_update ON tech_stack_2026.comments
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.note_suggestions s
          JOIN tech_stack_2026.notes n ON n.id = s.document_id
          WHERE s.id = comments.suggestion_id AND n.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.note_suggestions s
          JOIN tech_stack_2026.notes n ON n.id = s.document_id
          WHERE s.id = comments.suggestion_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comments' AND policyname = 'comments_suggestion_owner_delete'
  ) THEN
    CREATE POLICY comments_suggestion_owner_delete ON tech_stack_2026.comments
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.note_suggestions s
          JOIN tech_stack_2026.notes n ON n.id = s.document_id
          WHERE s.id = comments.suggestion_id AND n.user_id = auth.uid()
        )
      );
  END IF;
END $$;
