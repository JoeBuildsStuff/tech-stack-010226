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
  attachments = [],
  request = {}
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
    request,
  ]);
const complete = (
  turn,
  content = "answer",
  tools = [],
  actions = [],
  parts = null
) =>
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
    parts,
  ]);
const progress = (turn, parts, status = "streaming") =>
  rpc("save_chat_turn_progress", [
    turn.sessionId,
    turn.turnId,
    turn.assistantMessageId,
    parts,
    parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(""),
    status,
  ]);
const row = async (table, id, columns = "*") =>
  (await q(`select ${columns} from tech_stack_2026.${table} where id=$1`, [id]))[0];
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
  // Match the hosted project: functions receive direct anon grants by default.
  await db.exec("alter default privileges grant execute on functions to anon");
  await db.exec(
    readFileSync(
      "supabase/migrations/20260906174341_durable_chat_turns.sql",
      "utf8"
    )
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20260906235033_restrict_chat_turn_rpc_access.sql",
      "utf8"
    )
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261025120000_server_owned_chat_generation.sql",
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

test("turn RPCs deny direct anon grants while retaining authenticated access", async () => {
  const functions = await q(`select p.proname, p.prosecdef,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='tech_stack_2026' and p.proname in
    ('begin_chat_turn','complete_chat_turn','fail_chat_turn','select_chat_branch','clear_chat_conversation',
     'save_chat_turn_progress','resume_chat_turn','expire_stale_chat_turns')`);
  assert.equal(functions.length, 8);
  for (const fn of functions) {
    assert.equal(fn.anon_execute, false, fn.proname);
    assert.equal(fn.authenticated_execute, true, fn.proname);
    assert.equal(fn.prosecdef, false, fn.proname);
  }
  await db.exec("set role anon");
  try {
    await assert.rejects(
      () => rpc("clear_chat_conversation", [randomUUID()]),
      /permission denied/
    );
  } finally {
    await db.exec("set role authenticated");
  }
});

const text = (value) => ({ type: "text", text: value });
const askUser = (id, result) => ({
  type: "tool",
  toolCall: {
    id,
    name: "ask_user",
    arguments: { questions: [{ question: "Which?", choices: ["a", "b"] }] },
    ...(result ? { result } : {}),
  },
});

test("progress checkpoints store ordered parts, request metadata and a heartbeat", async () => {
  const sid = await session();
  const request = { clientTz: "UTC", clientPath: "/dashboard" };
  const turn = await begin(sid, "hi", "new", null, undefined, undefined, randomUUID(), [], request);
  assert.deepEqual((await row("chat_turns", turn.turnId, "request")).request, request);
  const parts = [
    { type: "thinking", text: "plan", startedAt: 1, endedAt: 2 },
    text("Hello"),
  ];
  assert.deepEqual(await progress(turn, parts), { status: "streaming" });
  const message = await row("chat_messages", turn.assistantMessageId, "parts,content,status");
  assert.deepEqual(message.parts, parts);
  assert.equal(message.content, "Hello");
  assert.equal(message.status, "streaming");
  assert.ok((await row("chat_turns", turn.turnId, "heartbeat_at")).heartbeat_at);
  const final = [...parts, text(" world")];
  await complete(turn, "Hello world", [], [], final);
  assert.deepEqual(
    (await row("chat_messages", turn.assistantMessageId, "parts")).parts,
    final
  );
});

test("a stopped turn tells its generator to halt and keeps what streamed", async () => {
  const sid = await session();
  const turn = await begin(sid);
  await progress(turn, [text("partial")]);
  await rpc("fail_chat_turn", [sid, turn.turnId, turn.assistantMessageId, "cancelled", "Response stopped", null]);
  assert.deepEqual(await progress(turn, [text("partial more")]), { status: "cancelled" });
  const message = await row("chat_messages", turn.assistantMessageId, "content,status,parts");
  assert.equal(message.status, "cancelled");
  assert.equal(message.content, "partial");
  assert.deepEqual(message.parts, [text("partial")]);
});

test("ask_user pauses a turn, an answer resumes it, and a new message skips it", async () => {
  const sid = await session();
  const turn = await begin(sid);
  await progress(turn, [askUser("call_1")], "awaiting_input");
  assert.equal((await row("chat_turns", turn.turnId, "status")).status, "awaiting_input");
  // Completing straight from awaiting_input is not allowed.
  await assert.rejects(() => complete(turn), /stopped/);
  const answered = [askUser("call_1", { success: true, data: { answers: [] } })];
  const resumed = await rpc("resume_chat_turn", [sid, turn.turnId, answered]);
  assert.equal(resumed.status, "streaming");
  assert.equal(resumed.assistantMessageId, turn.assistantMessageId);
  await assert.rejects(
    () => rpc("resume_chat_turn", [sid, turn.turnId, answered]),
    /not waiting/
  );
  await complete(turn, "done", [], [], [...answered, text("done")]);

  const paused = await begin(sid, "second");
  await progress(paused, [askUser("call_2")], "awaiting_input");
  const next = await begin(sid, "never mind");
  assert.equal((await row("chat_turns", paused.turnId, "status")).status, "completed");
  assert.equal(
    (await row("chat_messages", paused.assistantMessageId, "status")).status,
    "completed"
  );
  assert.equal(next.parentId, paused.assistantMessageId);
  await complete(next);
});

test("stop works on a turn waiting for an answer", async () => {
  const sid = await session();
  const turn = await begin(sid);
  await progress(turn, [askUser("call_3")], "awaiting_input");
  await rpc("fail_chat_turn", [sid, turn.turnId, turn.assistantMessageId, "cancelled", "Response stopped", null]);
  assert.equal((await row("chat_turns", turn.turnId, "status")).status, "cancelled");
});

test("turns whose generator stopped heartbeating expire; live ones do not", async () => {
  const sid = await session();
  const stale = await begin(sid);
  await progress(stale, [text("half")]);
  assert.equal(await rpc("expire_stale_chat_turns", [sid, 90]), 0);
  await db.exec("reset role");
  await q(
    "update tech_stack_2026.chat_turns set heartbeat_at=now()-interval '5 minutes' where id=$1",
    [stale.turnId]
  );
  await db.exec("set role authenticated");
  assert.equal(await rpc("expire_stale_chat_turns", [sid, 90]), 1);
  const message = await row("chat_messages", stale.assistantMessageId, "status,content");
  assert.equal(message.status, "failed");
  assert.equal(message.content, "half");
  // The conversation can move on.
  await complete(await begin(sid, "again"));
});

test("progress and resume reject other accounts", async () => {
  const sid = await session();
  const turn = await begin(sid);
  await q("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  try {
    await assert.rejects(() => progress(turn, [text("x")]), /not found/);
    await assert.rejects(() => rpc("resume_chat_turn", [sid, turn.turnId, []]), /not found/);
    await assert.rejects(() => rpc("expire_stale_chat_turns", [sid, 90]), /not found/);
  } finally {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  }
});
