-- Run as the database administrator against the intended Supabase project.
-- Uses two existing identities but only creates isolated fixture conversations.
-- All fixture rows roll back; PostgreSQL sequences may advance.
-- No provider calls, auth changes, or storage-object writes are performed.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL plpgsql.check_asserts = on;
DO $$
DECLARE
  identities uuid[];
  owner_id uuid;
  other_id uuid;
  sid uuid;
  second_sid uuid;
  turn jsonb;
  again jsonb;
  edited jsonb;
  retry jsonb;
  rejected boolean;
  fn record;
BEGIN
  SELECT array_agg(id) INTO identities FROM (SELECT id FROM auth.users ORDER BY id LIMIT 2) u;
  ASSERT cardinality(identities) = 2, 'Two existing auth identities are required';
  owner_id := identities[1]; other_id := identities[2];
  ASSERT (SELECT count(*) = 3 AND bool_and(relrowsecurity)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='tech_stack_2026' AND relname IN ('chat_sessions','chat_messages','chat_turns')), 'Missing tables or RLS';
  ASSERT (SELECT count(*) = 5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='tech_stack_2026' AND proname IN
    ('begin_chat_turn','complete_chat_turn','fail_chat_turn','select_chat_branch','clear_chat_conversation')), 'Missing RPCs';
  FOR fn IN SELECT p.oid, proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='tech_stack_2026' AND proname IN
    ('begin_chat_turn','complete_chat_turn','fail_chat_turn','select_chat_branch','clear_chat_conversation') LOOP
    ASSERT NOT fn.prosecdef, 'Turn RPC must use invoker permissions';
    ASSERT NOT has_function_privilege('anon',fn.oid,'EXECUTE'), 'Anonymous RPC access';
    ASSERT has_function_privilege('authenticated',fn.oid,'EXECUTE'), 'Missing authenticated RPC access';
  END LOOP;
  ASSERT (SELECT count(*)=2 AND NOT bool_or(public) FROM storage.buckets WHERE id IN ('chat-images','chat-files')), 'Chat buckets must be private';

  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  SET LOCAL ROLE authenticated;
  ASSERT auth.uid()=owner_id AND current_user='authenticated', 'Test must run under authenticated RLS';
  INSERT INTO tech_stack_2026.chat_sessions(user_id,title) VALUES(owner_id,'E8 rollback verification') RETURNING id INTO sid;
  INSERT INTO tech_stack_2026.chat_sessions(user_id,title) VALUES(owner_id,'E8 rollback branch target') RETURNING id INTO second_sid;
  turn := tech_stack_2026.begin_chat_turn(sid,'original','new',NULL,'grok-4.5','{"webSearchEnabled":false}',gen_random_uuid());
  again := tech_stack_2026.begin_chat_turn(sid,'original','new',NULL,'grok-4.5','{"webSearchEnabled":false}',(turn->>'turnId')::uuid);
  ASSERT again->>'assistantMessageId'=turn->>'assistantMessageId' AND (again->>'existing')::boolean, 'Begin is not idempotent';
  rejected := false;
  BEGIN
    PERFORM tech_stack_2026.begin_chat_turn(sid,'duplicate','new');
  EXCEPTION WHEN raise_exception THEN rejected := SQLERRM LIKE '%pending%'; END;
  ASSERT rejected, 'Second pending turn was accepted';

  rejected := false;
  BEGIN
    PERFORM tech_stack_2026.complete_chat_turn(sid,(turn->>'turnId')::uuid,(turn->>'assistantMessageId')::uuid,'answer',NULL,NULL,NULL,
      '[{"name":"search","arguments":{},"result":{"ok":true}}]', '[{"type":"INVALID","label":"bad","payload":{}}]');
  EXCEPTION WHEN invalid_text_representation THEN rejected := true; END;
  ASSERT rejected, 'Invalid action accepted';
  ASSERT (SELECT status='pending' FROM tech_stack_2026.chat_turns WHERE id=(turn->>'turnId')::uuid), 'Completion did not roll back';
  ASSERT NOT EXISTS(SELECT 1 FROM tech_stack_2026.chat_tool_calls WHERE message_id=(turn->>'assistantMessageId')::uuid), 'Partial metadata survived';
  PERFORM tech_stack_2026.complete_chat_turn(sid,(turn->>'turnId')::uuid,(turn->>'assistantMessageId')::uuid,'answer',NULL,NULL,NULL,
      '[{"name":"search","arguments":{},"result":{"ok":true}}]');
  PERFORM tech_stack_2026.complete_chat_turn(sid,(turn->>'turnId')::uuid,(turn->>'assistantMessageId')::uuid,'duplicate');
  ASSERT (SELECT content='answer' FROM tech_stack_2026.chat_messages WHERE id=(turn->>'assistantMessageId')::uuid), 'Completion overwritten';
  ASSERT (SELECT count(*)=1 FROM tech_stack_2026.chat_tool_calls WHERE message_id=(turn->>'assistantMessageId')::uuid), 'Tool metadata duplicated';

  edited := tech_stack_2026.begin_chat_turn(sid,'edited','edit',(turn->>'userMessageId')::uuid);
  ASSERT edited->'settings'=turn->'settings' AND edited->>'model'=turn->>'model', 'Edit settings changed';
  PERFORM tech_stack_2026.select_chat_branch(sid,(turn->>'assistantMessageId')::uuid);
  PERFORM tech_stack_2026.complete_chat_turn(sid,(edited->>'turnId')::uuid,(edited->>'assistantMessageId')::uuid,'edited answer');
  ASSERT (SELECT active_leaf_id=(turn->>'assistantMessageId')::uuid FROM tech_stack_2026.chat_sessions WHERE id=sid), 'Late completion moved branch';
  retry := tech_stack_2026.begin_chat_turn(sid,'','retry',(edited->>'assistantMessageId')::uuid);
  ASSERT retry->>'userMessageId'=edited->>'userMessageId' AND retry->'settings'=edited->'settings', 'Retry lost original settings/user';
  PERFORM tech_stack_2026.fail_chat_turn(sid,(retry->>'turnId')::uuid,(retry->>'assistantMessageId')::uuid,'cancelled','Stopped');
  rejected := false;
  BEGIN
    PERFORM tech_stack_2026.complete_chat_turn(sid,(retry->>'turnId')::uuid,(retry->>'assistantMessageId')::uuid,'late');
  EXCEPTION WHEN raise_exception THEN rejected := SQLERRM LIKE '%stopped%'; END;
  ASSERT rejected, 'Stopped turn completed';
  rejected := false;
  BEGIN
    PERFORM tech_stack_2026.select_chat_branch(second_sid,(turn->>'assistantMessageId')::uuid);
  EXCEPTION WHEN raise_exception THEN rejected := SQLERRM LIKE '%not found%'; END;
  ASSERT rejected, 'Cross-session branch accepted';

  PERFORM set_config('request.jwt.claim.sub',other_id::text,true);
  ASSERT NOT EXISTS(SELECT 1 FROM tech_stack_2026.chat_sessions WHERE id=sid), 'Session RLS leak';
  ASSERT NOT EXISTS(SELECT 1 FROM tech_stack_2026.chat_messages WHERE session_id=sid), 'Message RLS leak';
  ASSERT NOT EXISTS(SELECT 1 FROM tech_stack_2026.chat_turns WHERE session_id=sid), 'Turn RLS leak';
  rejected := false;
  BEGIN
    PERFORM tech_stack_2026.clear_chat_conversation(sid);
  EXCEPTION WHEN raise_exception THEN rejected := SQLERRM LIKE '%not found%'; END;
  ASSERT rejected, 'Cross-account clear accepted';
  rejected := false;
  BEGIN
    PERFORM tech_stack_2026.begin_chat_turn(sid,'intrusion','new');
  EXCEPTION WHEN no_data_found THEN rejected := true; END;
  ASSERT rejected, 'Cross-account begin accepted';

  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM tech_stack_2026.clear_chat_conversation(sid);
  ASSERT NOT EXISTS(SELECT 1 FROM tech_stack_2026.chat_messages WHERE session_id=sid), 'Clear retained messages';
  ASSERT NOT EXISTS(SELECT 1 FROM tech_stack_2026.chat_turns WHERE session_id=sid), 'Clear retained turns';
  ASSERT (SELECT active_leaf_id IS NULL FROM tech_stack_2026.chat_sessions WHERE id=sid), 'Clear retained leaf';
  rejected := false;
  BEGIN
    PERFORM tech_stack_2026.complete_chat_turn(sid,(turn->>'turnId')::uuid,(turn->>'assistantMessageId')::uuid,'late');
  EXCEPTION WHEN raise_exception THEN rejected := SQLERRM LIKE '%not found%'; END;
  ASSERT rejected, 'Clear resurrected a response';
  RESET ROLE;
END;
$$;
ROLLBACK;
SELECT 'PASS: deployed RPC permissions, RLS, idempotence, atomicity, edit/retry, branch selection, stop and clear; fixtures rolled back' AS result;
