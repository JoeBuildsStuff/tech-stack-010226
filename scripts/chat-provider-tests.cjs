/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS test harness */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Load the real provider converters and tool registry with SDKs and
// persistence stubbed out; nothing here calls a network.
class Sdk {}
const stubs = {
  "server-only": {},
  "@anthropic-ai/sdk": Object.assign(Sdk, { default: Sdk }),
  openai: Object.assign(Sdk, { default: Sdk }),
  "@cerebras/cerebras_cloud_sdk": Object.assign(Sdk, { default: Sdk }),
  "@/lib/supabase/server": { createClient: async () => ({}) },
  "@/components/tiptap/lib/comments": {},
  "@/app/dashboard/notes/note-path": {},
};
function loader(env = {}) {
  const modules = new Map();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const loadedModule = { exports: {} };
    modules.set(file, loadedModule);
    const req = (name) => {
      if (name in stubs) return stubs[name];
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/")
          ? path.resolve(name.slice(2))
          : path.resolve(path.dirname(file), name);
        const target = ["", ".ts", ".tsx", "/index.ts"]
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
      },
    }).outputText;
    vm.runInNewContext(code, {
      require: req,
      module: loadedModule,
      exports: loadedModule.exports,
      console,
      process: { env },
      crypto,
      Buffer,
    });
    return loadedModule.exports;
  }
  return load;
}
// Values come from the vm realm; compare them as JSON.
const json = (value) => JSON.parse(JSON.stringify(value));

const attachments = [
  { name: "photo.png", mimeType: "image/png", size: 3, content: { kind: "image", mediaType: "image/png", base64: "AAA" } },
  { name: "spec.pdf", mimeType: "application/pdf", size: 4, content: { kind: "pdf", base64: "BBBB" } },
  { name: "notes.md", mimeType: "text/markdown", size: 5, content: { kind: "text", text: "# hi", truncated: false } },
  { name: "deck.pptx", mimeType: "application/vnd.ms-powerpoint", size: 6, content: { kind: "unavailable", reason: "not supported" } },
];
const conversation = [
  { role: "user", text: "Research this", attachments },
  {
    role: "assistant",
    parts: [
      { type: "thinking", text: "plan", startedAt: 0, endedAt: 1 },
      { type: "text", text: "Searching." },
      {
        type: "tool",
        toolCall: {
          id: "call.1",
          name: "web_search",
          arguments: { query: "x" },
          result: { success: true, data: { results: [1] } },
        },
      },
      {
        type: "tool",
        toolCall: {
          id: "srv_1",
          name: "web_search",
          native: true,
          arguments: { query: "y" },
          result: { success: true, data: [] },
        },
      },
      { type: "text", text: "Found it." },
    ],
  },
  { role: "user", text: "And then?", attachments: [] },
  {
    role: "assistant",
    parts: [
      {
        type: "tool",
        toolCall: {
          id: "q1",
          name: "ask_user",
          arguments: { questions: [{ question: "Which?", choices: ["a", "b"] }] },
        },
      },
    ],
  },
];
const tools = new Set(["web_search", "ask_user"]);

test("Anthropic keeps attachments, pairs tool calls with results and alternates roles", () => {
  const load = loader();
  const { toAnthropicMessages } = load("lib/chat/server/providers/anthropic.ts");
  const messages = json(toAnthropicMessages(conversation, tools));
  assert.deepEqual(
    messages.map((m) => m.role),
    ["user", "assistant", "user", "assistant", "user", "assistant", "user"]
  );
  const first = messages[0].content;
  assert.equal(first[0].type, "image");
  assert.equal(first[1].type, "document");
  assert.match(first[2].text, /<file>\n# hi\n<\/file>/);
  assert.match(first[3].text, /could not be read: not supported/);
  assert.equal(first.at(-1).text, "Research this");

  const [said, used] = messages[1].content;
  assert.equal(said.type, "text");
  assert.match(said.text, /Searching\./);
  // The provider-run search is not replayable as a call; it becomes text.
  assert.match(said.text, /Earlier tool call: web_search\(\{"query":"y"\}\)/);
  assert.equal(used.type, "tool_use");
  assert.equal(used.id, "call_1", "ids are sanitized for Anthropic");
  assert.equal(messages[2].content[0].type, "tool_result");
  assert.equal(messages[2].content[0].tool_use_id, "call_1");
  assert.equal(messages[2].content[0].content, '{"results":[1]}');
  assert.equal(messages[3].content[0].text, "Found it.");
  // The follow-up question merges with nothing; the unanswered ask_user is replayed as skipped.
  assert.match(messages[6].content[0].content, /did not answer/);
});

test("Responses input pairs function calls and only sends PDFs where supported", () => {
  const load = loader();
  const { toResponsesInput } = load("lib/chat/server/providers/openai-responses.ts");
  const openai = json(toResponsesInput(conversation, tools, true));
  assert.equal(openai[0].content[1].type, "input_file");
  assert.equal(openai[0].content[1].file_data, "data:application/pdf;base64,BBBB");
  const call = openai.find((item) => item.type === "function_call");
  const output = openai.find((item) => item.type === "function_call_output");
  assert.equal(call.call_id, "call.1");
  assert.equal(output.call_id, "call.1");
  assert.equal(call.arguments, '{"query":"x"}');
  const xai = json(toResponsesInput(conversation, tools, false));
  assert.equal(xai[0].content[1].type, "input_text");
  assert.match(xai[0].content[1].text, /PDF this model cannot read/);
});

test("Cerebras gets text-only history with tool messages after each call", () => {
  const load = loader();
  const { toCerebrasMessages } = load("lib/chat/server/providers/cerebras.ts");
  const messages = json(toCerebrasMessages("SYSTEM", conversation, tools));
  assert.equal(messages[0].role, "system");
  assert.match(messages[1].content, /image this model cannot view/);
  const withCalls = messages.find((m) => m.tool_calls);
  assert.equal(withCalls.tool_calls[0].function.name, "web_search");
  const toolMessage = messages[messages.indexOf(withCalls) + 1];
  assert.equal(toolMessage.role, "tool");
  assert.equal(toolMessage.tool_call_id, "call.1");
});

test("tool calls the next request does not offer are written as text", () => {
  const load = loader();
  const { toAnthropicMessages } = load("lib/chat/server/providers/anthropic.ts");
  const messages = json(toAnthropicMessages(conversation.slice(0, 2), new Set(["ask_user"])));
  assert.equal(messages.length, 2);
  assert.ok(messages[1].content.every((block) => block.type === "text"));
  assert.match(messages[1].content[0].text, /web_search\(\{"query":"x"\}\) → \{"results":\[1\]\}/);
});

test("tool specs come from the Zod definitions, per search provider", () => {
  const without = loader()("lib/chat/server/tools/index.ts").enabledToolSpecs({
    webSearchEnabled: true,
  });
  const names = without.map((spec) => spec.name);
  assert.ok(names.includes("ask_user"));
  assert.ok(!names.includes("web_search"), "no search tool without a provider key");
  const ask = json(without.find((spec) => spec.name === "ask_user").parameters);
  assert.equal(ask.type, "object");
  assert.equal(ask.$schema, undefined);
  assert.deepEqual(ask.required, ["questions"]);

  const firecrawl = loader({ FIRECRAWL_API_KEY: "x" })(
    "lib/chat/server/tools/index.ts"
  ).enabledToolSpecs({ webSearchEnabled: true });
  const search = json(firecrawl.find((spec) => spec.name === "web_search").parameters);
  assert.ok("recency" in search.properties);
  assert.ok(!("site" in search.properties));
  const disabled = loader({ FIRECRAWL_API_KEY: "x" })(
    "lib/chat/server/tools/index.ts"
  ).enabledToolSpecs({ webSearchEnabled: false });
  assert.ok(!disabled.some((spec) => spec.name.startsWith("web_")));
});

test("executeTool validates arguments before running and rejects client tools", async () => {
  const { executeTool } = loader()("lib/chat/server/tools/index.ts");
  const invalid = json(await executeTool("notes_get_note", { maxChars: "lots" }, {}));
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /Invalid arguments for notes_get_note/);
  const client = json(await executeTool("ask_user", { questions: [] }, {}));
  assert.equal(client.success, false);
  assert.match(client.error, /Unknown function/);
});

test("context estimates: windows by model, attachments by type, compact labels", () => {
  const usage = loader()("lib/chat/context-usage.ts");
  assert.equal(usage.contextWindowFor("grok-4.5"), 256000);
  assert.equal(usage.contextWindowFor("gpt-oss-120b"), 131072);
  assert.equal(usage.contextWindowFor("claude-sonnet-5-5"), 200000);
  assert.equal(usage.estimateTextTokens("abcdefgh"), 2);
  assert.equal(usage.estimateAttachmentTokens({ name: "a.png", type: "image/png", size: 9e6 }), 1600);
  assert.equal(usage.estimateAttachmentTokens({ name: "a.ts", type: "", size: 4000 }), 1000);
  assert.equal(usage.estimateAttachmentTokens({ name: "a.zip", type: "application/zip", size: 9e6 }), 30);
  assert.equal(usage.formatTokens(21700), "21.7K");
  assert.equal(usage.formatTokens(256000), "256K");
  assert.equal(usage.formatTokens(999), "999");
});
