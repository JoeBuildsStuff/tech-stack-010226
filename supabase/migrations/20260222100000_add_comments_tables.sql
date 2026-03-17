-- Notes + inline comments in app schema

CREATE TABLE IF NOT EXISTS tech_stack_2026.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled',
  content text NOT NULL DEFAULT '',
  document_path text NOT NULL,
  sort_order double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_path)
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON tech_stack_2026.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_path ON tech_stack_2026.notes(user_id, document_path);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON tech_stack_2026.notes(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS tech_stack_2026.comment_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES tech_stack_2026.notes(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved')),
  anchor_from integer NOT NULL CHECK (anchor_from >= 1),
  anchor_to integer NOT NULL CHECK (anchor_to >= 1),
  anchor_exact text NOT NULL DEFAULT '',
  anchor_prefix text NOT NULL DEFAULT '',
  anchor_suffix text NOT NULL DEFAULT '',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tech_stack_2026.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES tech_stack_2026.comment_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comment_threads_document_id ON tech_stack_2026.comment_threads(document_id);
CREATE INDEX IF NOT EXISTS idx_comment_threads_document_updated ON tech_stack_2026.comment_threads(document_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_thread_id ON tech_stack_2026.comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_comments_thread_created ON tech_stack_2026.comments(thread_id, created_at ASC);

ALTER TABLE tech_stack_2026.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stack_2026.comment_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stack_2026.comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'notes' AND policyname = 'notes_owner_select'
  ) THEN
    CREATE POLICY notes_owner_select ON tech_stack_2026.notes
      FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'notes' AND policyname = 'notes_owner_insert'
  ) THEN
    CREATE POLICY notes_owner_insert ON tech_stack_2026.notes
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'notes' AND policyname = 'notes_owner_update'
  ) THEN
    CREATE POLICY notes_owner_update ON tech_stack_2026.notes
      FOR UPDATE TO authenticated
      USING ((SELECT auth.uid()) = user_id)
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'notes' AND policyname = 'notes_owner_delete'
  ) THEN
    CREATE POLICY notes_owner_delete ON tech_stack_2026.notes
      FOR DELETE TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comment_threads' AND policyname = 'comment_threads_owner_select'
  ) THEN
    CREATE POLICY comment_threads_owner_select ON tech_stack_2026.comment_threads
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = comment_threads.document_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comment_threads' AND policyname = 'comment_threads_owner_insert'
  ) THEN
    CREATE POLICY comment_threads_owner_insert ON tech_stack_2026.comment_threads
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = comment_threads.document_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comment_threads' AND policyname = 'comment_threads_owner_update'
  ) THEN
    CREATE POLICY comment_threads_owner_update ON tech_stack_2026.comment_threads
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = comment_threads.document_id AND n.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = comment_threads.document_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comment_threads' AND policyname = 'comment_threads_owner_delete'
  ) THEN
    CREATE POLICY comment_threads_owner_delete ON tech_stack_2026.comment_threads
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.notes n
          WHERE n.id = comment_threads.document_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comments' AND policyname = 'comments_owner_select'
  ) THEN
    CREATE POLICY comments_owner_select ON tech_stack_2026.comments
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.comment_threads t
          JOIN tech_stack_2026.notes n ON n.id = t.document_id
          WHERE t.id = comments.thread_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comments' AND policyname = 'comments_owner_insert'
  ) THEN
    CREATE POLICY comments_owner_insert ON tech_stack_2026.comments
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.comment_threads t
          JOIN tech_stack_2026.notes n ON n.id = t.document_id
          WHERE t.id = comments.thread_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comments' AND policyname = 'comments_owner_update'
  ) THEN
    CREATE POLICY comments_owner_update ON tech_stack_2026.comments
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.comment_threads t
          JOIN tech_stack_2026.notes n ON n.id = t.document_id
          WHERE t.id = comments.thread_id AND n.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.comment_threads t
          JOIN tech_stack_2026.notes n ON n.id = t.document_id
          WHERE t.id = comments.thread_id AND n.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tech_stack_2026' AND tablename = 'comments' AND policyname = 'comments_owner_delete'
  ) THEN
    CREATE POLICY comments_owner_delete ON tech_stack_2026.comments
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM tech_stack_2026.comment_threads t
          JOIN tech_stack_2026.notes n ON n.id = t.document_id
          WHERE t.id = comments.thread_id AND n.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION tech_stack_2026.create_note_comment_thread_with_root(
  p_document_id uuid,
  p_anchor_from integer,
  p_anchor_to integer,
  p_anchor_exact text,
  p_anchor_prefix text,
  p_anchor_suffix text,
  p_content text
)
RETURNS TABLE(thread_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  INSERT INTO tech_stack_2026.comment_threads (
    document_id,
    created_by,
    status,
    anchor_from,
    anchor_to,
    anchor_exact,
    anchor_prefix,
    anchor_suffix
  )
  VALUES (
    p_document_id,
    auth.uid(),
    'unresolved',
    p_anchor_from,
    p_anchor_to,
    COALESCE(p_anchor_exact, ''),
    COALESCE(p_anchor_prefix, ''),
    COALESCE(p_anchor_suffix, '')
  )
  RETURNING id INTO v_thread_id;

  INSERT INTO tech_stack_2026.comments (
    thread_id,
    user_id,
    content
  )
  VALUES (
    v_thread_id,
    auth.uid(),
    p_content
  );

  RETURN QUERY SELECT v_thread_id;
END;
$$;

CREATE OR REPLACE FUNCTION tech_stack_2026.batch_update_note_comment_thread_anchors(
  p_document_id uuid,
  p_anchors jsonb,
  p_now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE sql
AS $$
  WITH payload AS (
    SELECT
      a.id,
      a.anchor_from,
      a.anchor_to,
      a.anchor_exact,
      a.anchor_prefix,
      a.anchor_suffix
    FROM jsonb_to_recordset(COALESCE(p_anchors, '[]'::jsonb)) AS a(
      id uuid,
      anchor_from integer,
      anchor_to integer,
      anchor_exact text,
      anchor_prefix text,
      anchor_suffix text
    )
    WHERE a.anchor_from >= 1
      AND a.anchor_to > a.anchor_from
  )
  UPDATE tech_stack_2026.comment_threads AS t
  SET
    anchor_from = p.anchor_from,
    anchor_to = p.anchor_to,
    anchor_exact = COALESCE(p.anchor_exact, t.anchor_exact),
    anchor_prefix = COALESCE(p.anchor_prefix, t.anchor_prefix),
    anchor_suffix = COALESCE(p.anchor_suffix, t.anchor_suffix),
    updated_at = p_now
  FROM payload AS p
  WHERE t.id = p.id
    AND t.document_id = p_document_id;
$$;

GRANT ALL ON tech_stack_2026.notes TO anon, authenticated, service_role;
GRANT ALL ON tech_stack_2026.comment_threads TO anon, authenticated, service_role;
GRANT ALL ON tech_stack_2026.comments TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION tech_stack_2026.create_note_comment_thread_with_root(uuid, integer, integer, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tech_stack_2026.batch_update_note_comment_thread_anchors(uuid, jsonb, timestamptz) TO authenticated, service_role;
