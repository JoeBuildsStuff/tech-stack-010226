-- Durable chat turns and parent-linked branches.
-- This migration is additive so existing chat rows remain readable and can be
-- adopted by the service as completed turns.

ALTER TABLE tech_stack_2026.chat_sessions
  ADD COLUMN IF NOT EXISTS active_leaf_id uuid
    REFERENCES tech_stack_2026.chat_messages(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tech_stack_2026.chat_turns (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES tech_stack_2026.chat_sessions(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('new', 'edit', 'retry')),
  target_message_id uuid REFERENCES tech_stack_2026.chat_messages(id) ON DELETE SET NULL,
  user_message_id uuid REFERENCES tech_stack_2026.chat_messages(id) ON DELETE SET NULL,
  assistant_message_id uuid REFERENCES tech_stack_2026.chat_messages(id) ON DELETE SET NULL,
  model text NOT NULL DEFAULT '',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_turns_session_id
  ON tech_stack_2026.chat_turns(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_turns_user_message_id
  ON tech_stack_2026.chat_turns(user_message_id);
CREATE INDEX IF NOT EXISTS idx_chat_turns_assistant_message_id
  ON tech_stack_2026.chat_turns(assistant_message_id);

ALTER TABLE tech_stack_2026.chat_messages
  ADD COLUMN IF NOT EXISTS turn_id uuid
    REFERENCES tech_stack_2026.chat_turns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_chat_messages_turn_id
  ON tech_stack_2026.chat_messages(turn_id);

ALTER TABLE tech_stack_2026.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stack_2026.chat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stack_2026.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_turns_select ON tech_stack_2026.chat_turns;
DROP POLICY IF EXISTS chat_turns_insert ON tech_stack_2026.chat_turns;
DROP POLICY IF EXISTS chat_turns_update ON tech_stack_2026.chat_turns;
DROP POLICY IF EXISTS chat_turns_delete ON tech_stack_2026.chat_turns;

CREATE POLICY chat_turns_select ON tech_stack_2026.chat_turns
  FOR SELECT USING (tech_stack_2026.is_chat_session_owner(session_id));
CREATE POLICY chat_turns_insert ON tech_stack_2026.chat_turns
  FOR INSERT WITH CHECK (tech_stack_2026.is_chat_session_owner(session_id));
CREATE POLICY chat_turns_update ON tech_stack_2026.chat_turns
  FOR UPDATE USING (tech_stack_2026.is_chat_session_owner(session_id))
  WITH CHECK (tech_stack_2026.is_chat_session_owner(session_id));
CREATE POLICY chat_turns_delete ON tech_stack_2026.chat_turns
  FOR DELETE USING (tech_stack_2026.is_chat_session_owner(session_id));

GRANT ALL ON tech_stack_2026.chat_turns TO authenticated, service_role;

-- The previous client wrote a flat chronological transcript. Convert only
-- entirely unlinked legacy sessions, preserving any existing explicit graph.
WITH legacy_sessions AS (
  SELECT session_id FROM tech_stack_2026.chat_messages
  GROUP BY session_id HAVING bool_and(parent_id IS NULL AND turn_id IS NULL)
), ordered AS (
  SELECT id, lag(id) OVER (PARTITION BY session_id ORDER BY seq) AS previous_id
  FROM tech_stack_2026.chat_messages WHERE session_id IN (SELECT session_id FROM legacy_sessions)
)
UPDATE tech_stack_2026.chat_messages m SET parent_id = o.previous_id
FROM ordered o WHERE m.id = o.id;
UPDATE tech_stack_2026.chat_sessions s SET active_leaf_id = (
  SELECT m.id FROM tech_stack_2026.chat_messages m WHERE m.session_id = s.id ORDER BY m.seq DESC LIMIT 1
) WHERE s.active_leaf_id IS NULL;

CREATE OR REPLACE FUNCTION tech_stack_2026.begin_chat_turn(
  p_session_id uuid, p_content text, p_mode text,
  p_target_message_id uuid DEFAULT NULL, p_model text DEFAULT NULL,
  p_settings jsonb DEFAULT NULL, p_turn_id uuid DEFAULT NULL,
  p_context jsonb DEFAULT NULL, p_attachments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = tech_stack_2026, pg_temp
AS $$
DECLARE
  v_session chat_sessions%ROWTYPE;
  v_target chat_messages%ROWTYPE;
  v_user chat_messages%ROWTYPE;
  v_assistant chat_messages%ROWTYPE;
  v_turn chat_turns%ROWTYPE;
  v_parent_id uuid;
  v_turn_id uuid := COALESCE(p_turn_id, gen_random_uuid());
  v_model text;
  v_settings jsonb;
  v_context jsonb := p_context;
  v_attachments jsonb := COALESCE(p_attachments, '[]'::jsonb);
  v_variant integer;
BEGIN
  -- All turn mutations take the session lock first, then the turn lock.
  SELECT * INTO v_session FROM chat_sessions
    WHERE id = p_session_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found' USING ERRCODE = 'P0002'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('new', 'edit', 'retry') THEN RAISE EXCEPTION 'Invalid chat turn mode'; END IF;
  IF p_mode <> 'retry' AND length(trim(COALESCE(p_content, ''))) = 0 THEN RAISE EXCEPTION 'Message content is required'; END IF;

  SELECT * INTO v_turn FROM chat_turns WHERE id = v_turn_id AND session_id = p_session_id;
  IF FOUND THEN
    RETURN jsonb_build_object('turnId',v_turn.id,'sessionId',p_session_id,'mode',v_turn.mode,
      'userMessageId',v_turn.user_message_id,'assistantMessageId',v_turn.assistant_message_id,
      'model',v_turn.model,'settings',v_turn.settings,'status',v_turn.status,'existing',true);
  END IF;

  IF p_mode IN ('edit', 'retry') THEN
    SELECT * INTO v_target FROM chat_messages WHERE id = p_target_message_id AND session_id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Branch target not found'; END IF;
    IF p_mode = 'edit' AND v_target.role <> 'user' THEN RAISE EXCEPTION 'Only user messages can be edited'; END IF;
    IF p_mode = 'retry' THEN
      IF v_target.role = 'user' THEN v_user := v_target;
      ELSE
        -- Works for legacy records as well as new persisted turns.
        WITH RECURSIVE ancestors AS (
          SELECT m.* FROM chat_messages m WHERE m.id = v_target.parent_id AND m.session_id = p_session_id
          UNION SELECT m.* FROM chat_messages m JOIN ancestors a ON a.parent_id = m.id
            WHERE m.session_id = p_session_id
        ) SELECT * INTO v_user FROM ancestors WHERE role = 'user' ORDER BY seq DESC LIMIT 1;
      END IF;
      IF v_user.id IS NULL THEN RAISE EXCEPTION 'Retry target has no user message'; END IF;
    END IF;
  END IF;

  -- Explicitly retrying/editing an interrupted turn supersedes it. A late
  -- completion is then rejected instead of resurrecting the old response.
  IF p_mode IN ('edit','retry') AND v_target.turn_id IS NOT NULL THEN
    UPDATE chat_messages SET status = 'cancelled'
      WHERE turn_id = v_target.turn_id AND role = 'assistant' AND status IN ('pending','streaming');
    UPDATE chat_turns SET status = 'cancelled', error = 'Superseded by a new branch', updated_at = now()
      WHERE id = v_target.turn_id AND status IN ('pending','streaming');
  END IF;
  IF EXISTS (SELECT 1 FROM chat_turns WHERE session_id = p_session_id AND status IN ('pending','streaming')) THEN
    RAISE EXCEPTION 'A response is still pending. Stop it or retry the interrupted response first.';
  END IF;

  v_model := COALESCE(NULLIF(p_model,''), NULLIF(v_target.model,''), NULLIF(v_user.model,''), 'gpt-5.6-terra');
  v_settings := COALESCE(p_settings, NULLIF(v_target.settings,'{}'::jsonb), NULLIF(v_user.settings,'{}'::jsonb), '{"webSearchEnabled":true}'::jsonb);
  IF jsonb_typeof(v_settings) <> 'object' THEN RAISE EXCEPTION 'Invalid chat settings'; END IF;

  IF p_mode = 'edit' THEN
    v_parent_id := v_target.parent_id;
    v_context := v_target.context;
    IF jsonb_array_length(v_attachments) = 0 THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'mime_type',mime_type,'size',size,
        'storage_path',storage_path,'width',width,'height',height)), '[]'::jsonb)
      INTO v_attachments FROM chat_attachments WHERE message_id = v_target.id;
    END IF;
  ELSIF p_mode = 'new' THEN
    v_parent_id := v_session.active_leaf_id;
  END IF;
  IF v_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM chat_messages WHERE id = v_parent_id AND session_id = p_session_id
  ) THEN RAISE EXCEPTION 'Parent belongs to another conversation'; END IF;
  IF jsonb_typeof(v_attachments) <> 'array' THEN RAISE EXCEPTION 'Invalid attachments'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_attachments) a
      WHERE split_part(a->>'storage_path','/',2) IS DISTINCT FROM auth.uid()::text) THEN
    RAISE EXCEPTION 'Attachment belongs to another account';
  END IF;

  INSERT INTO chat_turns(id,session_id,mode,target_message_id,model,settings)
    VALUES(v_turn_id,p_session_id,p_mode,p_target_message_id,v_model,v_settings);
  IF p_mode <> 'retry' THEN
    SELECT count(*)::integer INTO v_variant FROM chat_messages
      WHERE session_id = p_session_id AND parent_id IS NOT DISTINCT FROM v_parent_id AND role = 'user';
    INSERT INTO chat_messages(session_id,parent_id,role,content,context,turn_id,model,settings,status,variant_index)
      VALUES(p_session_id,v_parent_id,'user',p_content,v_context,v_turn_id,v_model,v_settings,'completed',v_variant)
      RETURNING * INTO v_user;
    UPDATE chat_messages SET root_user_message_id = v_user.id WHERE id = v_user.id;
    INSERT INTO chat_attachments(message_id,name,mime_type,size,storage_path,width,height)
      SELECT v_user.id,a.name,a.mime_type,a.size,a.storage_path,a.width,a.height
      FROM jsonb_to_recordset(v_attachments) AS a(name text,mime_type text,size bigint,storage_path text,width int,height int);
  END IF;
  SELECT count(*)::integer INTO v_variant FROM chat_messages
    WHERE session_id = p_session_id AND parent_id = v_user.id AND role = 'assistant';
  INSERT INTO chat_messages(session_id,parent_id,role,content,turn_id,model,settings,status,root_user_message_id,variant_group_id,variant_index)
    VALUES(p_session_id,v_user.id,'assistant','',v_turn_id,v_model,v_settings,'pending',v_user.id,v_user.id,v_variant)
    RETURNING * INTO v_assistant;
  UPDATE chat_turns SET user_message_id=v_user.id,assistant_message_id=v_assistant.id WHERE id=v_turn_id;
  UPDATE chat_sessions SET active_leaf_id=v_assistant.id,updated_at=now() WHERE id=p_session_id;
  RETURN jsonb_build_object('turnId',v_turn_id,'sessionId',p_session_id,'mode',p_mode,
    'userMessageId',v_user.id,'assistantMessageId',v_assistant.id,'parentId',v_user.parent_id,
    'model',v_model,'settings',v_settings,'status','pending','existing',false);
END;
$$;

CREATE OR REPLACE FUNCTION tech_stack_2026.complete_chat_turn(
  p_session_id uuid, p_turn_id uuid, p_assistant_message_id uuid, p_content text,
  p_reasoning text DEFAULT NULL, p_citations jsonb DEFAULT NULL,
  p_function_result jsonb DEFAULT NULL, p_tool_calls jsonb DEFAULT '[]'::jsonb,
  p_actions jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = tech_stack_2026, pg_temp
AS $$
DECLARE v_turn chat_turns%ROWTYPE;
BEGIN
  PERFORM 1 FROM chat_sessions WHERE id=p_session_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found'; END IF;
  SELECT * INTO v_turn FROM chat_turns WHERE id=p_turn_id AND session_id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_turn.assistant_message_id IS DISTINCT FROM p_assistant_message_id THEN RAISE EXCEPTION 'Chat turn not found'; END IF;
  IF v_turn.status = 'completed' THEN RETURN jsonb_build_object('id',p_assistant_message_id,'status','completed'); END IF;
  IF v_turn.status NOT IN ('pending','streaming') THEN RAISE EXCEPTION 'Turn has already stopped'; END IF;
  UPDATE chat_messages SET content=COALESCE(p_content,''),reasoning=p_reasoning,citations=p_citations,
    function_result=p_function_result,status='completed' WHERE id=p_assistant_message_id AND session_id=p_session_id;
  INSERT INTO chat_tool_calls(message_id,name,arguments,result,reasoning)
    SELECT p_assistant_message_id,a.name,a.arguments,a.result,a.reasoning
    FROM jsonb_to_recordset(COALESCE(p_tool_calls,'[]'::jsonb)) a(name text,arguments jsonb,result jsonb,reasoning text);
  INSERT INTO chat_suggested_actions(message_id,type,label,payload)
    SELECT p_assistant_message_id,a.type::chat_action_type,a.label,a.payload
    FROM jsonb_to_recordset(COALESCE(p_actions,'[]'::jsonb)) a(type text,label text,payload jsonb);
  UPDATE chat_turns SET status='completed',error=NULL,updated_at=now() WHERE id=p_turn_id;
  -- Selection is owned by begin/select. Completing an older response must not move it.
  UPDATE chat_sessions SET updated_at=now() WHERE id=p_session_id;
  RETURN jsonb_build_object('id',p_assistant_message_id,'status','completed');
END;
$$;

CREATE OR REPLACE FUNCTION tech_stack_2026.fail_chat_turn(
  p_session_id uuid, p_turn_id uuid, p_assistant_message_id uuid,
  p_status text, p_error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = tech_stack_2026, pg_temp
AS $$
DECLARE v_turn chat_turns%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('failed','cancelled') THEN RAISE EXCEPTION 'Invalid terminal status'; END IF;
  PERFORM 1 FROM chat_sessions WHERE id=p_session_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found'; END IF;
  SELECT * INTO v_turn FROM chat_turns WHERE id=p_turn_id AND session_id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_turn.assistant_message_id IS DISTINCT FROM p_assistant_message_id THEN RAISE EXCEPTION 'Chat turn not found'; END IF;
  IF v_turn.status IN ('pending','streaming') THEN
    UPDATE chat_messages SET status=p_status,content=COALESCE(p_error,'Response interrupted') WHERE id=p_assistant_message_id;
    UPDATE chat_turns SET status=p_status,error=p_error,updated_at=now() WHERE id=p_turn_id;
    UPDATE chat_sessions SET updated_at=now() WHERE id=p_session_id;
  END IF;
  RETURN jsonb_build_object('turnId',p_turn_id,'assistantMessageId',p_assistant_message_id,'status',p_status);
END;
$$;

CREATE OR REPLACE FUNCTION tech_stack_2026.select_chat_branch(p_session_id uuid,p_message_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = tech_stack_2026, pg_temp
AS $$
DECLARE v_leaf uuid;
BEGIN
  PERFORM 1 FROM chat_sessions WHERE id=p_session_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM chat_messages WHERE id=p_message_id AND session_id=p_session_id) THEN RAISE EXCEPTION 'Branch not found'; END IF;
  WITH RECURSIVE descendants AS (
    SELECT id,parent_id,seq FROM chat_messages WHERE id=p_message_id AND session_id=p_session_id
    UNION SELECT m.id,m.parent_id,m.seq FROM chat_messages m JOIN descendants d ON m.parent_id=d.id WHERE m.session_id=p_session_id
  ) SELECT id INTO v_leaf FROM descendants ORDER BY seq DESC LIMIT 1;
  UPDATE chat_sessions SET active_leaf_id=v_leaf,updated_at=now() WHERE id=p_session_id;
  RETURN jsonb_build_object('activeLeafId',v_leaf);
END;
$$;

CREATE OR REPLACE FUNCTION tech_stack_2026.clear_chat_conversation(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = tech_stack_2026, pg_temp
AS $$
DECLARE v_attachments jsonb;
BEGIN
  PERFORM 1 FROM chat_sessions WHERE id=p_session_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('storage_path',a.storage_path,'mime_type',a.mime_type)),'[]'::jsonb)
    INTO v_attachments FROM chat_attachments a JOIN chat_messages m ON m.id=a.message_id WHERE m.session_id=p_session_id;
  UPDATE chat_sessions SET active_leaf_id=NULL,updated_at=now() WHERE id=p_session_id;
  DELETE FROM chat_branch_state WHERE session_id=p_session_id;
  DELETE FROM chat_turns WHERE session_id=p_session_id;
  DELETE FROM chat_messages WHERE session_id=p_session_id;
  RETURN jsonb_build_object('success',true,'activeLeafId',NULL,'attachments',v_attachments);
END;
$$;

REVOKE ALL ON FUNCTION tech_stack_2026.begin_chat_turn(uuid,text,text,uuid,text,jsonb,uuid,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tech_stack_2026.complete_chat_turn(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tech_stack_2026.fail_chat_turn(uuid,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tech_stack_2026.select_chat_branch(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tech_stack_2026.clear_chat_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tech_stack_2026.begin_chat_turn(uuid,text,text,uuid,text,jsonb,uuid,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION tech_stack_2026.complete_chat_turn(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION tech_stack_2026.fail_chat_turn(uuid,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION tech_stack_2026.select_chat_branch(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION tech_stack_2026.clear_chat_conversation(uuid) TO authenticated;
