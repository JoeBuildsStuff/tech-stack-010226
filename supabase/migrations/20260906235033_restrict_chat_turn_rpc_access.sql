-- Supabase default privileges can grant anon EXECUTE directly. Revoking
-- PUBLIC alone does not remove those grants on existing or new functions.
REVOKE ALL ON FUNCTION tech_stack_2026.begin_chat_turn(uuid,text,text,uuid,text,jsonb,uuid,jsonb,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tech_stack_2026.complete_chat_turn(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tech_stack_2026.fail_chat_turn(uuid,uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tech_stack_2026.select_chat_branch(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tech_stack_2026.clear_chat_conversation(uuid) FROM PUBLIC, anon;
