/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS test harness */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the real hook/store with controlled transport and server-action boundaries.
function harness() {
  const modules = new Map();
  /** Open turn streams by session id: { kind, options, resolve, reject, turnId }. */
  const pending = new Map();
  const stored = new Map();
  const starts = [];
  const cancels = [];
  const attaches = [];
  const answers = [];
  const memory = new Map();
  const localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
  const msg = (id, role, content, parentId = null, extra = {}) => ({
    id,
    sessionId: "A",
    parentId,
    role,
    content,
    parts: role === "assistant" && content ? [{ type: "text", text: content }] : [],
    context: null,
    citations: [],
    createdAt: new Date().toISOString(),
    seq: 1,
    turnId: null,
    model: "gpt-5.6-terra",
    settings: { reasoningEffort: "low", webSearchEnabled: false },
    status: "completed",
    variantGroupId: null,
    variantIndex: 0,
    attachments: [],
    suggestedActions: [],
    ...extra,
  });
  const conversation = (sid) => ({
    session: {
      id: sid,
      title: `Chat ${sid}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    messages: stored.get(sid) || [],
    selectedPath: stored.get(sid) || [],
    branches: {},
    activeLeafId: null,
  });
  const actions = {
    createChatSession: async () => ({
      data: {
        id: "NEW",
        title: "New Chat",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    getChatConversation: async (sid) => ({ data: conversation(sid) }),
    selectChatBranch: async () => ({ data: { success: true } }),
    clearChatConversation: async (sid) => {
      stored.set(sid, []);
      return { data: { success: true } };
    },
  };
  const openStream = (kind, sessionId, options, extra = {}) =>
    new Promise((resolve, reject) => {
      pending.set(sessionId, { kind, options, resolve, reject, ...extra });
      options.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Stopped", "AbortError")),
        { once: true }
      );
    });
  const transport = {
    startTurn: (options) => {
      starts.push(options);
      return openStream("start", options.sessionId, options, {
        turnId: options.turnId,
      });
    },
    attachTurn: (turnId, options) => {
      attaches.push(turnId);
      const sid = [...stored].find(([, rows]) =>
        rows.some((row) => row.turnId === turnId)
      )?.[0];
      return openStream("attach", sid, options, { turnId });
    },
    answerTurn: (turnId, answer, options) => {
      answers.push({ turnId, answer });
      const sid = [...stored].find(([, rows]) =>
        rows.some((row) => row.turnId === turnId)
      )?.[0];
      return openStream("answer", sid, options, { turnId });
    },
    cancelTurn: async (turnId) => {
      cancels.push(turnId);
    },
  };
  /** Simulate the server acknowledging a start: user + pending assistant. */
  const acknowledge = (sid, content = "question") => {
    const stream = pending.get(sid);
    const { turnId, mode, content: sent } = stream.options;
    const user = msg(`${turnId}-user`, "user", sent || content, null, {
      sessionId: sid,
      turnId,
    });
    const assistant = msg(`${turnId}-assistant`, "assistant", "", user.id, {
      sessionId: sid,
      turnId,
      status: "pending",
    });
    stored.set(sid, [...(stored.get(sid) || []), user, assistant]);
    stream.options.onMessage({
      type: "turn",
      turn: {
        sessionId: sid,
        turnId,
        mode,
        userMessageId: user.id,
        assistantMessageId: assistant.id,
        parentId: null,
        model: "grok-4.5",
        settings: { reasoningEffort: "high", webSearchEnabled: false },
        existing: false,
        userMessage: user,
        history: [],
      },
    });
    return { user, assistant, turnId };
  };
  /** Simulate the server finishing a turn and persisting the reply. */
  const finish = (sid, status = "completed", text = "answer") => {
    const stream = pending.get(sid);
    const rows = stored.get(sid) || [];
    const assistant = rows.findLast((row) => row.turnId === stream.turnId && row.role === "assistant");
    if (assistant) {
      assistant.status = status;
      assistant.content = text;
      assistant.parts = [{ type: "text", text }];
    }
    stream.options.onMessage({ type: "status", status });
    pending.delete(sid);
    stream.resolve();
  };
  const event = (sid, value) =>
    pending.get(sid).options.onMessage({ type: "event", event: value });

  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const loadedModule = { exports: {} };
    modules.set(file, loadedModule);
    const req = (name) => {
      if (name === "@/actions/chat") return actions;
      if (name === "@/lib/chat/client/transport") return transport;
      if (name === "react" && file.endsWith("use-chat.tsx"))
        return { useCallback: (f) => f, useMemo: (f) => f() };
      if (name === "zustand") {
        const actual = require("zustand");
        return {
          ...actual,
          create: (...args) => {
            const build = (initializer) => {
              const store = actual.create(initializer);
              return Object.assign(
                (selector) => selector(store.getState()),
                store
              );
            };
            return args.length ? build(...args) : build;
          },
        };
      }
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/")
          ? path.resolve(name.slice(2))
          : path.resolve(path.dirname(file), name);
        const target = ["", ".ts", ".tsx"]
          .map((ext) => base + ext)
          .find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
        return load(target);
      }
      return require(name);
    };
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    vm.runInNewContext(code, {
      require: req,
      module: loadedModule,
      exports: loadedModule.exports,
      console,
      window: {
        localStorage,
        location: { pathname: "/dashboard/notes/example" },
      },
      localStorage,
      Blob,
      crypto,
      setTimeout,
      clearTimeout,
      queueMicrotask,
      DOMException,
      AbortController,
      structuredClone,
      fetch: async () => ({ ok: false }),
      FormData,
      File,
      TextDecoder,
      TextEncoder,
      Response,
      ReadableStream,
    });
    return loadedModule.exports;
  }
  const store = load("lib/chat/chat-store.ts").useChatStore;
  store.getState().setAccount("owner");
  for (const id of ["A", "B"])
    store.getState().upsertSessionFromServer({
      id,
      title: `Chat ${id}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
    });
  store.getState().setCurrentSessionIdFromServer("A");
  const hook = load("hooks/use-chat.tsx").useChat();
  return {
    hook,
    actions,
    store,
    pending,
    stored,
    starts,
    cancels,
    attaches,
    answers,
    memory,
    load,
    msg,
    acknowledge,
    finish,
    event,
  };
}
async function waitFor(predicate) {
  for (let i = 0; i < 30; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Expected boundary not reached");
}
const session = (h, id) => h.store.getState().sessions.find((s) => s.id === id);

test("switching sessions keeps the stream with the originating conversation", async () => {
  const h = harness();
  const a = h.hook.sendMessage("A question");
  await waitFor(() => h.pending.has("A"));
  h.acknowledge("A");
  h.store.getState().setCurrentSessionIdFromServer("B");
  h.event("A", { type: "text-delta", delta: "A answer" });
  assert.equal(h.store.getState().messages.length, 0);
  assert.equal(session(h, "A").messages.at(-1).parts.at(-1).text, "A answer");
  h.finish("A", "completed", "A answer");
  await a;
  assert.equal(h.starts[0].sessionId, "A");
  assert.equal(h.store.getState().currentSessionId, "B");
});

test("stopping B cancels B on the server only while A keeps generating", async () => {
  const h = harness();
  const a = h.hook.sendMessage("A");
  await waitFor(() => h.pending.has("A"));
  h.acknowledge("A");
  h.store.getState().setCurrentSessionIdFromServer("B");
  const b = h.hook.sendMessage("B");
  await waitFor(() => h.pending.has("B"));
  const { turnId } = h.acknowledge("B");
  await h.hook.stopMessage();
  assert.equal(JSON.stringify(h.cancels), JSON.stringify([turnId]));
  // The server records the stop and ends B's stream.
  h.finish("B", "cancelled", "");
  await b;
  assert.equal(h.pending.get("A").options.signal.aborted, false);
  assert.equal(h.store.getState().isSessionLoading("A"), true);
  assert.equal(session(h, "B").messages.at(-1).status, "cancelled");
  h.finish("A");
  await a;
});

test("closing the stream does not stop the turn; only Stop cancels it", async () => {
  const h = harness();
  const a = h.hook.sendMessage("question");
  await waitFor(() => h.pending.has("A"));
  h.acknowledge("A");
  h.pending.get("A").reject(new TypeError("network error"));
  await assert.rejects(a, /network error/);
  assert.equal(h.cancels.length, 0);
  assert.equal(h.store.getState().isSessionLoading("A"), false);
});

test("account change aborts watching and prevents late state", async () => {
  const h = harness();
  const a = h.hook.sendMessage("private");
  await waitFor(() => h.pending.has("A"));
  const stream = h.pending.get("A");
  h.store.getState().setAccount("new-owner");
  stream.options.onMessage({
    type: "event",
    event: { type: "text-delta", delta: "late private text" },
  });
  await a;
  assert.equal(h.store.getState().messages.length, 0);
  assert.equal(h.store.getState().sessions.length, 0);
});

test("a failed turn ends the request and shows the failure", async () => {
  const h = harness();
  const a = h.hook.sendMessage("question");
  await waitFor(() => h.pending.has("A"));
  h.acknowledge("A");
  h.finish("A", "failed", "Provider unavailable");
  await a;
  assert.equal(h.store.getState().messages.at(-1).status, "failed");
  assert.equal(h.store.getState().isSessionLoading("A"), false);
});

test("retry lets the server resolve the saved model and settings", async () => {
  const h = harness();
  const a = h.hook.retryMessage("original-assistant");
  await waitFor(() => h.pending.has("A"));
  assert.equal(h.starts[0].mode, "retry");
  assert.equal(h.starts[0].targetMessageId, "original-assistant");
  assert.equal(h.starts[0].model, undefined);
  assert.equal(h.starts[0].settings, undefined);
  h.acknowledge("A");
  h.finish("A");
  await a;
});

test("stream events build ordered parts, dropping silent thinking", () => {
  const h = harness();
  const { applyTurnEvent, joinTextParts, pendingClientToolCalls } = h.load(
    "lib/chat/parts.ts"
  );
  const events = [
    { type: "thinking-start", at: 0 },
    { type: "thinking-end", at: 200 },
    { type: "text-delta", delta: "Let me check." },
    { type: "thinking-start", at: 1000 },
    { type: "thinking-delta", delta: "searching" },
    { type: "thinking-end", at: 3000 },
    {
      type: "tool-call",
      toolCall: { id: "t1", name: "web_search", arguments: { query: "x" } },
    },
    { type: "tool-result", id: "t1", result: { success: true, data: [] } },
    {
      type: "tool-call",
      toolCall: { id: "q1", name: "ask_user", arguments: { questions: [] } },
    },
    { type: "text-delta", delta: "Done" },
  ];
  const parts = events.reduce(applyTurnEvent, []);
  // Values from the vm realm: compare as JSON, not by prototype.
  assert.equal(
    JSON.stringify(parts.map((part) => part.type)),
    JSON.stringify(["text", "thinking", "tool", "tool", "text"])
  );
  assert.equal(parts[1].endedAt, 3000);
  assert.equal(parts[2].toolCall.result.success, true);
  assert.equal(joinTextParts(parts), "Let me check.\n\nDone");
  assert.equal(
    JSON.stringify(pendingClientToolCalls(parts).map((call) => call.id)),
    JSON.stringify(["q1"])
  );
});

test("answering ask_user continues the same reply", async () => {
  const h = harness();
  const question = {
    type: "tool",
    toolCall: {
      id: "q1",
      name: "ask_user",
      arguments: { questions: [{ question: "Which?", choices: ["a", "b"] }] },
    },
  };
  h.stored.set("A", [
    h.msg("u1", "user", "do it", null, { turnId: "T1" }),
    h.msg("a1", "assistant", "", "u1", {
      turnId: "T1",
      status: "awaiting_input",
      parts: [question],
    }),
  ]);
  await h.hook.loadConversation("A");
  assert.equal(h.attaches.length, 0, "a paused turn is not attached");
  const message = h.store.getState().messages.at(-1);
  const answering = h.hook.answerQuestion(message, "q1", {
    answers: [{ question: "Which?", answer: "a" }],
  });
  await waitFor(() => h.pending.has("A"));
  assert.equal(
    JSON.stringify(h.answers[0]),
    JSON.stringify({
      turnId: "T1",
      answer: { toolCallId: "q1", output: { answers: [{ question: "Which?", answer: "a" }] } },
    })
  );
  h.event("A", {
    type: "tool-result",
    id: "q1",
    result: { success: true, data: { answers: [] } },
  });
  h.event("A", { type: "text-delta", delta: "Going with a" });
  const live = h.store.getState().messages.at(-1);
  assert.equal(live.id, "a1");
  assert.equal(JSON.stringify(live.parts.map((part) => part.type)), '["tool","text"]');
  h.finish("A", "completed", "Going with a");
  await answering;
});

test("loading a conversation attaches to a turn still generating on the server", async () => {
  const h = harness();
  h.stored.set("A", [
    h.msg("u1", "user", "long task", null, { turnId: "T9" }),
    h.msg("a1", "assistant", "partial", "u1", { turnId: "T9", status: "streaming" }),
  ]);
  const loading = h.hook.loadConversation("A");
  await waitFor(() => h.pending.has("A"));
  assert.equal(JSON.stringify(h.attaches), '["T9"]');
  h.pending.get("A").options.onMessage({
    type: "snapshot",
    parts: [{ type: "text", text: "partial and more" }],
    status: "streaming",
    citations: [],
  });
  assert.equal(h.store.getState().messages.at(-1).parts[0].text, "partial and more");
  h.finish("A", "completed", "partial and more");
  await loading;
});

test("a streamed token replaces only its message, not its siblings or other sessions", async () => {
  const h = harness();
  h.stored.set("B", [h.msg("b1", "user", "other session")]);
  await h.hook.loadConversation("B", { select: false });
  const a = h.hook.sendMessage("question");
  await waitFor(() => h.pending.has("A"));
  h.acknowledge("A");
  const before = h.store.getState();
  const userBefore = before.messages[0];
  const sessionB = session(h, "B");
  h.event("A", { type: "text-delta", delta: "token" });
  const after = h.store.getState();
  assert.equal(after.messages[0], userBefore);
  assert.notEqual(after.messages.at(-1), before.messages.at(-1));
  assert.equal(session(h, "B"), sessionB);
  h.finish("A");
  await a;
});

test("store account epochs isolate transcripts and preserve only matching UI preferences", () => {
  const h = harness();
  h.store.getState().setLayoutMode("inset");
  h.store.getState().openSessionTab("A");
  const ownerEpoch = h.store.getState().accountEpoch;
  h.store.getState().setAccount("other-owner");
  assert.equal(h.store.getState().isAccountReady, true);
  assert.ok(h.store.getState().accountEpoch > ownerEpoch);
  assert.equal(h.store.getState().sessions.length, 0);
  assert.equal(h.store.getState().messages.length, 0);
  assert.equal(h.store.getState().openSessionIds.length, 0);
  assert.equal(h.store.getState().isLoading, false);
  h.store.getState().setAccount("owner");
  assert.equal(h.store.getState().layoutMode, "inset");
  assert.equal(JSON.stringify(h.store.getState().openSessionIds), '["A"]');
});

test("request completion is keyed so an old finally cannot clear a newer request", () => {
  const h = harness();
  assert.equal(h.store.getState().beginRequest("A", "first"), true);
  h.store.getState().finishRequest("A", "first");
  assert.equal(h.store.getState().beginRequest("A", "second"), true);
  h.store.getState().finishRequest("A", "first");
  assert.equal(h.store.getState().loadingBySession.A, "second");
  h.store.getState().setCurrentSessionIdFromServer("B");
  assert.equal(h.store.getState().isLoading, false);
  h.store.getState().finishRequest("A", "second");
  h.store.getState().setCurrentSessionIdFromServer("A");
  assert.equal(h.store.getState().isLoading, false);
});

test("summary upserts never discard an already hydrated transcript", () => {
  const h = harness();
  h.store.getState().setMessagesForSession("A", [
    { id: "local-user", role: "user", content: "local", timestamp: new Date() },
  ]);
  h.store.getState().upsertSessionFromServer({
    id: "A",
    title: "Chat A",
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
  });
  assert.equal(session(h, "A").messages[0].id, "local-user");
});

test("persisted cache contains only owner-scoped preferences and never transcript text", () => {
  const h = harness();
  h.store.getState().setMessagesForSession("A", [
    { id: "secret", role: "user", content: "private transcript", timestamp: new Date() },
  ]);
  h.store.getState().openSessionTab("A");
  assert.ok(h.memory.size > 0);
  for (const [key, value] of h.memory) {
    assert.ok(key.includes("account:owner"));
    assert.equal(value.includes("private transcript"), false);
    const saved = JSON.parse(value).state;
    assert.equal(saved.sessions, undefined);
    assert.equal(saved.messages, undefined);
  }
  const epoch = h.store.getState().accountEpoch;
  h.store.getState().beginRequest("A", "ongoing");
  h.store.getState().setAccount("owner");
  assert.equal(h.store.getState().accountEpoch, epoch);
  assert.equal(h.store.getState().isRequestCurrent("A", "ongoing"), true);
});

test("stream decoder handles CRLF frames and fragmented UTF-8", async () => {
  const h = harness();
  const { readTurnStream } = h.load("lib/chat/client/stream.ts");
  const frames = [
    { type: "event", event: { type: "text-delta", delta: "Hello 🌎" } },
    { type: "status", status: "completed" },
  ];
  const bytes = new TextEncoder().encode(
    frames.map((frame) => `data: ${JSON.stringify(frame)}\r\n\r\n`).join("")
  );
  const received = [];
  await readTurnStream(
    new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
          controller.close();
        },
      })
    ),
    (message) => received.push(message),
    new AbortController().signal
  );
  assert.equal(received[0].event.delta, "Hello 🌎");
  assert.equal(received[1].status, "completed");
});

test("durable graph includes current siblings and reconstructs each branch independently", () => {
  const h = harness();
  const { pathToMessage, conversationBranches } = h.load(
    "lib/chat/conversation-graph.ts"
  );
  const messages = [
    { id: "u1", parentId: null, role: "user", seq: 1 },
    { id: "a1", parentId: "u1", role: "assistant", seq: 2 },
    { id: "u2", parentId: "a1", role: "user", seq: 3 },
    { id: "a2", parentId: "u2", role: "assistant", seq: 4 },
    { id: "edit", parentId: null, role: "user", seq: 5 },
    { id: "edited-answer", parentId: "edit", role: "assistant", seq: 6 },
    { id: "retry", parentId: "u1", role: "assistant", seq: 7 },
  ];
  const oldPath = pathToMessage(messages, "a2");
  assert.equal(
    JSON.stringify(oldPath.map((m) => m.id)),
    JSON.stringify(["u1", "a1", "u2", "a2"])
  );
  const branches = conversationBranches(messages, oldPath);
  assert.equal(
    JSON.stringify(branches.u1.siblingIds),
    JSON.stringify(["u1", "edit"])
  );
  assert.equal(
    JSON.stringify(branches.a1.siblingIds),
    JSON.stringify(["a1", "retry"])
  );
  assert.equal(
    JSON.stringify(pathToMessage(messages, "edited-answer").map((m) => m.id)),
    JSON.stringify(["edit", "edited-answer"])
  );
  assert.throws(
    () =>
      pathToMessage(
        [{ id: "loop", parentId: "loop", role: "user", seq: 1 }],
        "loop"
      ),
    /cycle/
  );
});

test("a history load started before generation cannot overwrite streamed text", async () => {
  const h = harness();
  const original = h.actions.getChatConversation;
  let release;
  h.actions.getChatConversation = async (sid) => {
    const snapshot = await original(sid);
    await new Promise((resolve) => {
      release = resolve;
    });
    return snapshot;
  };
  const loading = h.hook.loadConversation("A");
  await waitFor(() => release);
  h.actions.getChatConversation = original;
  const sending = h.hook.sendMessage("question");
  await waitFor(() => h.pending.has("A"));
  h.acknowledge("A");
  h.event("A", { type: "text-delta", delta: "streamed answer" });
  release();
  await loading;
  assert.equal(
    h.store.getState().messages.at(-1).parts.at(-1).text,
    "streamed answer"
  );
  h.finish("A", "completed", "streamed answer");
  await sending;
});
