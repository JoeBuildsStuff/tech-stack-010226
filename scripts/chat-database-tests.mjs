import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = randomUUID(),
  other = randomUUID(),
  legacySession = randomUUID();
const oldUser = randomUUID(),
  oldAssistant = randomUUID();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const rpc = async (name, args) =>
  (
    await q(
      `select tech_stack_2026.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as data`,
      args
    )
  )[0].data;
const session = async () =>
  (
    await q(
      "insert into tech_stack_2026.chat_sessions(user_id,title) values ($1,$2) returning id",
      [owner, "Test"]
    )
  )[0].id;
const begin = (
  sid,
  content = "question",
  mode = "new",
  target = null,
  model = "grok-4.5",
  settings = { reasoningEffort: "high", webSearchEnabled: false },
  turnId = randomUUID(),
  attachments = []
) =>
  rpc("begin_chat_turn", [
    sid,
    content,
    mode,
    target,
    model,
    settings,
    turnId,
    null,
    attachments,
  ]);
const complete = (turn, content = "answer", tools = [], actions = []) =>
  rpc("complete_chat_turn", [
    turn.sessionId,
    turn.turnId,
    turn.assistantMessageId,
    content,
    null,
    null,
    null,
    tools,
    actions,
  ]);
const leaf = async (sid) =>
  (
    await q(
      "select active_leaf_id from tech_stack_2026.chat_sessions where id=$1",
      [sid]
    )
  )[0].active_leaf_id;

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema tech_stack_2026;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,tech_stack_2026 to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;`);
  await q("insert into auth.users values ($1),($2)", [owner, other]);
  await db.exec(
    readFileSync(
      "supabase/migrations/20260201100000_tech_stack_2026_chat_tables.sql",
      "utf8"
    )
  );
  await q(
    "insert into tech_stack_2026.chat_sessions(id,user_id) values ($1,$2)",
    [legacySession, owner]
  );
  await q(
    "insert into tech_stack_2026.chat_messages(id,session_id,role,content) values ($1,$2,'user','legacy question'),($3,$2,'assistant','legacy answer')",
    [oldUser, legacySession, oldAssistant]
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20260906174341_durable_chat_turns.sql",
      "utf8"
    )
  );
  await db.exec("set role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
});
after(() => db.close());

test("migration retains legacy transcript order and enables retry", async () => {
  assert.equal(await leaf(legacySession), oldAssistant);
  assert.equal(
    (
      await q(
        "select parent_id from tech_stack_2026.chat_messages where id=$1",
        [oldAssistant]
      )
    )[0].parent_id,
    oldUser
  );
  const turn = await begin(
    legacySession,
    "",
    "retry",
    oldAssistant,
    null,
    null
  );
  assert.equal(turn.userMessageId, oldUser);
  assert.equal(turn.model, "gpt-5.6-terra");
  await complete(turn);
});

test("new turn and retry IDs are idempotent and metadata completion is atomic", async () => {
  const sid = await session(),
    id = randomUUID();
  const turn = await begin(sid, "hello", "new", null, undefined, undefined, id);
  const repeated = await begin(
    sid,
    "hello",
    "new",
    null,
    undefined,
    undefined,
    id
  );
  assert.equal(repeated.assistantMessageId, turn.assistantMessageId);
  await assert.rejects(() =>
    complete(
      turn,
      "answer",
      [{ name: "search", arguments: {}, result: { success: true } }],
      [{ type: "INVALID", label: "oops", payload: {} }]
    )
  );
  assert.equal(
    (
      await q("select status from tech_stack_2026.chat_messages where id=$1", [
        turn.assistantMessageId,
      ])
    )[0].status,
    "pending"
  );
  assert.equal(
    (
      await q(
        "select count(*)::int as n from tech_stack_2026.chat_tool_calls where message_id=$1",
        [turn.assistantMessageId]
      )
    )[0].n,
    0
  );
  await complete(turn, "answer", [
    { name: "search", arguments: {}, result: { success: true } },
  ]);
  await complete(turn, "changed", [
    { name: "search", arguments: {}, result: { success: true } },
  ]);
  assert.equal(
    (
      await q(
        "select count(*)::int as n from tech_stack_2026.chat_tool_calls where message_id=$1",
        [turn.assistantMessageId]
      )
    )[0].n,
    1
  );
  assert.equal(
    (
      await q("select content from tech_stack_2026.chat_messages where id=$1", [
        turn.assistantMessageId,
      ])
    )[0].content,
    "answer"
  );
});

test("edit preserves original branch, model/settings/attachments and selecting restores its continuation", async () => {
  const sid = await session();
  const original = await begin(
    sid,
    "original",
    "new",
    null,
    undefined,
    undefined,
    randomUUID(),
    [
      {
        name: "image.png",
        mime_type: "image/png",
        size: 3,
        storage_path: `chat/${owner}/image.png`,
      },
    ]
  );
  await complete(original);
  const continuation = await begin(sid, "followup");
  await complete(continuation);
  const edited = await begin(
    sid,
    "edited",
    "edit",
    original.userMessageId,
    null,
    null
  );
  await complete(edited);
  assert.equal(edited.model, original.model);
  assert.deepEqual(edited.settings, original.settings);
  const rows = await q(
    "select id,parent_id,content from tech_stack_2026.chat_messages where id in ($1,$2)",
    [original.userMessageId, edited.userMessageId]
  );
  assert.equal(
    rows.find((m) => m.id === original.userMessageId).content,
    "original"
  );
  assert.equal(rows.find((m) => m.id === edited.userMessageId).parent_id, null);
  assert.equal(
    (
      await q(
        "select storage_path from tech_stack_2026.chat_attachments where message_id=$1",
        [edited.userMessageId]
      )
    )[0].storage_path,
    `chat/${owner}/image.png`
  );
  await rpc("select_chat_branch", [sid, original.userMessageId]);
  assert.equal(await leaf(sid), continuation.assistantMessageId);
  const retry = await begin(
    sid,
    "",
    "retry",
    original.assistantMessageId,
    null,
    null
  );
  assert.deepEqual(retry.settings, original.settings);
  assert.equal(retry.userMessageId, original.userMessageId);
  await complete(retry);
});

test("late completion preserves branch selection and a late failure cannot undo completed output", async () => {
  const sid = await session();
  const first = await begin(sid);
  await complete(first);
  const retry = await begin(
    sid,
    "",
    "retry",
    first.assistantMessageId,
    null,
    null
  );
  await rpc("select_chat_branch", [sid, first.assistantMessageId]);
  await complete(retry);
  assert.equal(await leaf(sid), first.assistantMessageId);
  await rpc("fail_chat_turn", [
    sid,
    retry.turnId,
    retry.assistantMessageId,
    "failed",
    "late failure",
  ]);
  assert.equal(
    (
      await q("select status from tech_stack_2026.chat_messages where id=$1", [
        retry.assistantMessageId,
      ])
    )[0].status,
    "completed"
  );
});

test("cancelled and orphaned turns can be retried, with old completions rejected", async () => {
  const sid = await session();
  const pending = await begin(sid);
  await assert.rejects(() => begin(sid, "concurrent"), /pending/);
  const retry = await begin(
    sid,
    "",
    "retry",
    pending.assistantMessageId,
    null,
    null
  );
  await assert.rejects(() => complete(pending), /stopped/);
  await rpc("fail_chat_turn", [
    sid,
    retry.turnId,
    retry.assistantMessageId,
    "cancelled",
    "Response stopped",
  ]);
  assert.equal(await leaf(sid), retry.assistantMessageId);
  assert.equal(
    (
      await q("select status from tech_stack_2026.chat_messages where id=$1", [
        retry.assistantMessageId,
      ])
    )[0].status,
    "cancelled"
  );
});

test("clear is durable and late completion cannot recreate deleted messages", async () => {
  const sid = await session();
  const turn = await begin(sid);
  await rpc("clear_chat_conversation", [sid]);
  await assert.rejects(() => complete(turn), /not found/);
  assert.equal(await leaf(sid), null);
  assert.equal(
    (
      await q(
        "select count(*)::int as n from tech_stack_2026.chat_messages where session_id=$1",
        [sid]
      )
    )[0].n,
    0
  );
  const next = await begin(sid, "fresh");
  assert.equal(next.parentId, null);
  await complete(next);
});

test("RLS and RPCs reject other accounts and cross-session branch targets", async () => {
  const sid = await session();
  const turn = await begin(sid);
  await complete(turn);
  const another = await session();
  await assert.rejects(
    () => begin(another, "bad", "edit", turn.userMessageId),
    /not found/
  );
  await assert.rejects(
    () => rpc("select_chat_branch", [another, turn.assistantMessageId]),
    /not found/
  );
  await q("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  try {
    assert.equal(
      (
        await q(
          "select id from tech_stack_2026.chat_messages where session_id=$1",
          [sid]
        )
      ).length,
      0
    );
    await assert.rejects(() => begin(sid), /not found/);
    await assert.rejects(
      () => rpc("clear_chat_conversation", [sid]),
      /not found/
    );
    await assert.rejects(() => complete(turn), /not found/);
  } finally {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  }
});
