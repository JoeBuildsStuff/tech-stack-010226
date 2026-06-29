-- Redline (tracked changes) suggestion metadata. The document marks remain the
-- source of truth for content/position; this table mirrors identity/author/status
-- to power the review panel and future multi-user. No anchor positions stored.

CREATE TABLE IF NOT EXISTS tech_stack_2026.note_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES tech_stack_2026.notes(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('insert', 'delete', 'replace')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  preview text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_note_suggestions_document_id ON tech_stack_2026.note_suggestions(document_id);
CREATE INDEX IF NOT EXISTS idx_note_suggestions_document_status ON tech_stack_2026.note_suggestions(document_id, status);

ALTER TABLE tech_stack_2026.note_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'note_suggestions' AND policyname = 'note_suggestions_owner_select'
  ) THEN
    CREATE POLICY note_suggestions_owner_select ON tech_stack_2026.note_suggestions
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = note_suggestions.document_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'note_suggestions' AND policyname = 'note_suggestions_owner_insert'
  ) THEN
    CREATE POLICY note_suggestions_owner_insert ON tech_stack_2026.note_suggestions
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = note_suggestions.document_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'note_suggestions' AND policyname = 'note_suggestions_owner_update'
  ) THEN
    CREATE POLICY note_suggestions_owner_update ON tech_stack_2026.note_suggestions
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = note_suggestions.document_id AND n.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = note_suggestions.document_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'note_suggestions' AND policyname = 'note_suggestions_owner_delete'
  ) THEN
    CREATE POLICY note_suggestions_owner_delete ON tech_stack_2026.note_suggestions
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = note_suggestions.document_id AND n.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Reconcile the set of open suggestions found in the document with the table:
-- upsert each item (creating rows for new suggestions, refreshing preview/kind on
-- existing open rows), leaving resolved rows untouched.
CREATE OR REPLACE FUNCTION tech_stack_2026.reconcile_note_suggestions(
  p_document_id uuid,
  p_items jsonb,
  p_now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO tech_stack_2026.note_suggestions AS s (
    id,
    document_id,
    created_by,
    kind,
    status,
    preview,
    created_at,
    updated_at
  )
  SELECT
    i.id,
    p_document_id,
    auth.uid(),
    i.kind,
    'open',
    COALESCE(i.preview, ''),
    p_now,
    p_now
  FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb)) AS i(
    id uuid,
    kind text,
    preview text
  )
  WHERE i.kind IN ('insert', 'delete', 'replace')
  ON CONFLICT (id) DO UPDATE
    SET
      kind = EXCLUDED.kind,
      preview = EXCLUDED.preview,
      updated_at = p_now
    WHERE s.status = 'open';
$$;

GRANT ALL ON tech_stack_2026.note_suggestions TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION tech_stack_2026.reconcile_note_suggestions(uuid, jsonb, timestamptz) TO authenticated, service_role;
