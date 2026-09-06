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
  const pending = new Map();
  const stored = new Map();
  const completions = [];
  const failures = [];
  const calls = [];
  const memory = new Map();
  let completionError;
  const localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
  const msg = (id, role, content, parentId = null) => ({
    id,
    sessionId: "A",
    parentId,
    role,
    content,
    reasoning: null,
    context: null,
    functionResult: null,
    citations: null,
    createdAt: new Date().toISOString(),
    seq: 1,
    turnId: null,
    model: "gpt-5.6-terra",
    settings: { reasoningEffort: "low", webSearchEnabled: false },
    status: "completed",
    variantGroupId: null,
    variantIndex: 0,
    attachments: [],
    toolCalls: [],
    suggestedActions: [],
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
    beginChatTurn: async (input) => {
      calls.push(input);
      const user = {
        ...msg(`${input.turnId}-user`, "user", input.content || "saved prompt"),
        sessionId: input.sessionId,
      };
      const turn = {
        sessionId: input.sessionId,
        turnId: input.turnId,
        userMessageId: user.id,
        assistantMessageId: `${input.turnId}-assistant`,
        history: [],
        userMessage: user,
        model: "grok-4.5",
        settings: { reasoningEffort: "high", webSearchEnabled: false },
      };
      stored.set(input.sessionId, [user]);
      return { data: turn };
    },
    completeChatTurn: async (input) => {
      completions.push(input);
      if (completionError) return { error: completionError };
      const assistant = {
        ...msg(input.assistantMessageId, "assistant", input.content),
        sessionId: input.sessionId,
      };
      stored.get(input.sessionId).push(assistant);
      return { data: assistant };
    },
    failChatTurn: async (input) => {
      failures.push(input);
      return { data: { success: true } };
    },
    getChatConversation: async (sid) => ({ data: conversation(sid) }),
    selectChatBranch: async () => ({ data: { success: true } }),
    clearChatConversation: async (sid) => {
      stored.set(sid, []);
      return { data: { success: true } };
    },
  };
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const loadedModule = { exports: {} };
    modules.set(file, loadedModule);
    const req = (name) => {
      if (name === "@/actions/chat") return actions;
      if (name === "@/lib/chat/client/transport")
        return {
          sendChatRequest: (options) =>
            new Promise((resolve, reject) => {
              const input = calls.at(-1);
              pending.set(input.sessionId, { options, resolve, reject });
              options.signal.addEventListener(
                "abort",
                () => reject(new DOMException("Stopped", "AbortError")),
                { once: true }
              );
            }),
        };
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
      DOMException,
      AbortController,
      structuredClone,
      fetch: async () => ({ ok: false }),
      FormData,
      File,
      TextDecoder,
      Response,
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
  store.getState().switchToSession("A");
  const hook = load("hooks/use-chat.tsx").useChat();
  return {
    hook,
    actions,
    store,
    pending,
    calls,
    completions,
    failures,
    memory,
    load,
    setCompletionError: (v) => {
      completionError = v;
    },
  };
}
async function waitFor(predicate) {
  for (let i = 0; i < 30; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Expected boundary not reached");
}

test("switching sessions keeps history, stream deltas and persistence with the originating conversation", async () => {
  const h = harness();
  const a = h.hook.sendMessage("A question");
  await waitFor(() => h.pending.has("A"));
  h.store.getState().switchToSession("B");
  h.pending.get("A").options.onDelta("A answer");
  assert.equal(h.store.getState().messages.length, 0);
  assert.equal(
    h.store
      .getState()
      .sessions.find((s) => s.id === "A")
      .messages.at(-1).content,
    "A answer"
  );
  h.pending.get("A").resolve({ message: "A answer" });
  await a;
  assert.equal(h.completions[0].sessionId, "A");
  assert.equal(h.store.getState().currentSessionId, "B");
});

test("stopping B cancels B only while A is still generating", async () => {
  const h = harness();
  const a = h.hook.sendMessage("A");
  await waitFor(() => h.pending.has("A"));
  h.store.getState().switchToSession("B");
  const b = h.hook.sendMessage("B");
  await waitFor(() => h.pending.has("B"));
  h.hook.stopMessage();
  await b;
  assert.equal(h.pending.get("A").options.signal.aborted, false);
  assert.equal(h.failures[0].sessionId, "B");
  assert.equal(h.failures[0].status, "cancelled");
  assert.equal(h.store.getState().isSessionLoading("A"), true);
  h.pending.get("A").resolve({ message: "done" });
  await a;
});

test("account change aborts request and prevents late database/state completion", async () => {
  const h = harness();
  const a = h.hook.sendMessage("private");
  await waitFor(() => h.pending.has("A"));
  h.store.getState().setAccount("new-owner");
  h.pending.get("A").options.onDelta("late private text");
  await a;
  assert.equal(h.store.getState().messages.length, 0);
  assert.equal(h.store.getState().sessions.length, 0);
  assert.equal(h.completions.length, 0);
  assert.equal(h.failures.length, 0);
});

test("a returned save error is a failed turn, not successful completion", async () => {
  const h = harness();
  h.setCompletionError("database unavailable");
  const a = h.hook.sendMessage("question");
  await waitFor(() => h.pending.has("A"));
  h.pending.get("A").resolve({ message: "answer" });
  await assert.rejects(a, /database unavailable/);
  assert.equal(h.failures[0].status, "failed");
  assert.equal(h.store.getState().isSessionLoading("A"), false);
});

test("retry delegates original model/settings resolution to persisted turn and honors returned settings", async () => {
  const h = harness();
  const a = h.hook.retryMessage("original-assistant");
  await waitFor(() => h.pending.has("A"));
  assert.equal(h.calls[0].mode, "retry");
  assert.equal(h.calls[0].targetMessageId, "original-assistant");
  assert.equal(h.calls[0].model, undefined);
  assert.equal(h.calls[0].settings, undefined);
  assert.equal(h.pending.get("A").options.model, "grok-4.5");
  assert.equal(h.pending.get("A").options.webSearchEnabled, false);
  h.pending.get("A").resolve({ message: "new variant" });
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
  h.store.getState().switchToSession("B");
  assert.equal(h.store.getState().isLoading, false);
  h.store.getState().finishRequest("A", "second");
  h.store.getState().switchToSession("A");
  assert.equal(h.store.getState().isLoading, false);
});

test("summary upserts never discard an already hydrated transcript", () => {
  const h = harness();
  h.store.getState().addMessageToSession("A", {
    id: "local-user",
    role: "user",
    content: "local",
    timestamp: new Date(),
  });
  assert.equal(
    h.store.getState().sessions.find((s) => s.id === "A").messages.length,
    1
  );
  h.store.getState().upsertSessionFromServer({
    id: "A",
    title: "Chat A",
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
  });
  assert.equal(
    h.store.getState().sessions.find((s) => s.id === "A").messages[0].id,
    "local-user"
  );
});

test("persisted cache contains only owner-scoped preferences and never transcript text", () => {
  const h = harness();
  h.store.getState().addMessageToSession("A", {
    id: "secret",
    role: "user",
    content: "private transcript",
  });
  h.store.getState().openSessionTab("A");
  for (const [key, value] of h.memory) {
    assert.ok(key.includes("account:owner"));
    assert.equal(value.includes("private transcript"), false);
    const saved = JSON.parse(value).state;
    assert.equal(saved.sessions, undefined);
    assert.equal(saved.messages, undefined);
    assert.equal(saved.messageBranches, undefined);
  }
  const epoch = h.store.getState().accountEpoch;
  h.store.getState().beginRequest("A", "ongoing");
  h.store.getState().setAccount("owner");
  assert.equal(h.store.getState().accountEpoch, epoch);
  assert.equal(h.store.getState().isRequestCurrent("A", "ongoing"), true);
});

test("stream decoder rejects EOF without a terminal event and preserves fragmented UTF-8", async () => {
  const h = harness();
  const { readChatStream } = h.load("lib/chat/client/stream.ts");
  await assert.rejects(
    () =>
      readChatStream(
        new Response('event: delta\ndata: {"delta":"partial"}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
        () => {},
        new AbortController().signal
      ),
    /ended before completion/
  );
  const bytes = new TextEncoder().encode(
    'event: delta\r\ndata: {"delta":"Hello 🌎"}\r\n\r\nevent: done\r\ndata: {"message":"Hello 🌎"}\r\n\r\n'
  );
  let received = "";
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } }
  );
  const result = await readChatStream(
    response,
    (delta) => (received += delta),
    new AbortController().signal
  );
  assert.equal(received, "Hello 🌎");
  assert.equal(result.message, "Hello 🌎");
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
  h.pending.get("A").options.onDelta("streamed answer");
  release();
  await loading;
  assert.equal(h.store.getState().messages.at(-1).content, "streamed answer");
  h.pending.get("A").resolve({ message: "streamed answer" });
  await sending;
});
