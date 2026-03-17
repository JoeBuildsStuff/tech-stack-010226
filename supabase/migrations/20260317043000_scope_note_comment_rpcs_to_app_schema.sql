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

GRANT EXECUTE ON FUNCTION tech_stack_2026.create_note_comment_thread_with_root(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION tech_stack_2026.batch_update_note_comment_thread_anchors(
  uuid,
  jsonb,
  timestamptz
) TO authenticated, service_role;
