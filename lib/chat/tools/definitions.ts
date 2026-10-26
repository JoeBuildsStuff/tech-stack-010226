import { z } from "zod";

/**
 * Model-facing tool definitions, shared by the server (provider schemas,
 * argument validation) and the client (typed tool parts). Executors live in
 * `lib/chat/server/tools`; a tool without one is answered in the UI.
 *
 * Input types come from these schemas and output types from the executors, so
 * renaming a field here is a build error in the executor and in any UI that
 * reads it.
 */

const MAX_NOTE_CHARS = 20000;
const MAX_COMMENT_CHARS = 4000;
const MAX_THREADS = 200;
const MAX_LIST_NOTES = 100;
export const MAX_SEARCH_LIMIT = 8;
export const DEFAULT_SEARCH_LIMIT = 5;
export const MAX_SCRAPE_CHARS = 30000;
export const DEFAULT_SCRAPE_CHARS = 12000;

const noteId = z
  .string()
  .describe("Note ID (the value in /dashboard/notes/{noteId}).");

type ToolKind = "server" | "client";

interface ToolDefinition<
  Kind extends ToolKind,
  Input extends z.ZodObject,
  Output extends z.ZodType | undefined = undefined,
> {
  kind: Kind;
  description: string;
  input: Input;
  /** Client tools declare their output; server outputs come from the executor. */
  output: Output;
}

function serverTool<Input extends z.ZodObject>(definition: {
  description: string;
  input: Input;
}): ToolDefinition<"server", Input> {
  return { kind: "server", output: undefined, ...definition };
}

function clientTool<Input extends z.ZodObject, Output extends z.ZodType>(
  definition: { description: string; input: Input; output: Output }
): ToolDefinition<"client", Input, Output> {
  return { kind: "client", ...definition };
}

export const toolDefinitions = {
  notes_create_note: serverTool({
    description:
      "Create a new note for the current user. Returns the created note ID, metadata, and URL.",
    input: z.object({
      title: z
        .string()
        .optional()
        .describe('Optional title for the new note. Defaults to "My Note".'),
      content: z
        .string()
        .optional()
        .describe(
          "Optional initial content for the new note. Markdown and HTML are accepted; content is saved as sanitized HTML."
        ),
    }),
  }),
  notes_list_notes: serverTool({
    description:
      'List or count notes owned by the current user. Use this for questions like "how many notes do I have?" or "show my notes".',
    input: z.object({
      limit: z
        .int()
        .optional()
        .describe(
          `Maximum number of note summaries to return (1-${MAX_LIST_NOTES}). Defaults to 20.`
        ),
      includeNotes: z
        .boolean()
        .optional()
        .describe(
          "Whether to include note summaries. Defaults to true. Set false when only the total count is needed."
        ),
    }),
  }),
  notes_get_note: serverTool({
    description:
      "Retrieve a note by ID, including title/content. Use this before summarizing or editing a note.",
    input: z.object({
      noteId,
      maxChars: z
        .int()
        .optional()
        .describe(
          `Optional max characters of note content to return (1-${MAX_NOTE_CHARS}).`
        ),
    }),
  }),
  notes_get_comments: serverTool({
    description:
      "Retrieve comment threads for a note, including replies and resolved/unresolved status.",
    input: z.object({
      noteId,
      includeResolved: z
        .boolean()
        .optional()
        .describe("Include resolved threads. Defaults to true."),
      limitThreads: z
        .int()
        .optional()
        .describe(
          `Maximum number of threads to return (1-${MAX_THREADS}). Defaults to 50.`
        ),
      maxCharsPerComment: z
        .int()
        .optional()
        .describe(
          `Maximum comment content size in chars per comment (1-${MAX_COMMENT_CHARS}). Defaults to ${MAX_COMMENT_CHARS}.`
        ),
    }),
  }),
  notes_update_note: serverTool({
    description: "Update note title and/or content for a note you own.",
    input: z.object({
      noteId,
      title: z.string().optional().describe("Updated note title."),
      content: z
        .string()
        .optional()
        .describe(
          "Updated full note content (replaces existing content). Markdown and HTML are accepted; content is saved as sanitized HTML."
        ),
    }),
  }),
  notes_add_comment: serverTool({
    description:
      "Create a new comment thread on a note. This starts a top-level comment (not a reply). Without anchorText, the comment attaches to the document (no text highlight).",
    input: z.object({
      noteId,
      content: z.string().describe("Comment content for the new thread."),
      anchorText: z
        .string()
        .optional()
        .describe(
          "Optional text to attach the thread to. When omitted, the comment is document-level with no highlight."
        ),
    }),
  }),
  notes_reply_to_comment: serverTool({
    description: "Add a reply to an existing comment thread on a note.",
    input: z.object({
      noteId,
      threadId: z.string().describe("Thread ID to reply to."),
      content: z.string().describe("Reply content."),
    }),
  }),
  web_search: serverTool({
    description:
      "Search the live web. Use for current, time-sensitive, or externally verifiable information. Returns source titles, URLs, and descriptions; cite the returned URLs in the final response.",
    // One schema for every search provider; each provider exposes only the
    // fields it supports (see WEB_SEARCH_FIELDS).
    input: z.object({
      query: z.string().describe("Search query, up to 500 characters."),
      limit: z
        .int()
        .optional()
        .describe(
          `Number of results to return (1-${MAX_SEARCH_LIMIT}, default ${DEFAULT_SEARCH_LIMIT}).`
        ),
      recency: z
        .enum(["hour", "day", "week", "month", "year"])
        .optional()
        .describe("Optional recency filter."),
      includeDomains: z
        .array(z.string())
        .optional()
        .describe("Optional hostnames to search, without protocol or paths."),
      excludeDomains: z
        .array(z.string())
        .optional()
        .describe(
          "Optional hostnames to exclude. Do not combine with includeDomains."
        ),
      site: z
        .string()
        .optional()
        .describe(
          "Optional domain to restrict search results to (e.g. example.com)."
        ),
    }),
  }),
  web_scrape: serverTool({
    description:
      "Read the main content of a public web page and return clean Markdown. Use after web_search when result descriptions are insufficient. Cite the page URL in the final response.",
    input: z.object({
      url: z.string().describe("Public HTTP or HTTPS URL to read."),
      maxChars: z
        .int()
        .optional()
        .describe(
          `Maximum Markdown characters to return (1-${MAX_SCRAPE_CHARS}, default ${DEFAULT_SCRAPE_CHARS}).`
        ),
    }),
  }),
  ask_user: clientTool({
    description:
      "Ask the user clarifying questions when their request is ambiguous and a wrong guess would waste work. Provide one or more questions, each with up to 4 short, distinct answer choices. The user can also answer in their own words. Do not use this for questions you can answer yourself or with other tools.",
    input: z.object({
      questions: z
        .array(
          z.object({
            question: z.string().describe("The question to ask"),
            choices: z
              .array(z.string())
              .min(2)
              .max(4)
              .describe("Two to four short answer choices"),
          })
        )
        .min(1)
        .max(4)
        .describe("The questions to ask the user"),
    }),
    output: z
      .object({
        answers: z.array(
          z.object({ question: z.string(), answer: z.string() })
        ),
      })
      .describe("The user's answer to each question"),
  }),
} as const;

export type ToolDefinitions = typeof toolDefinitions;
export type ToolName = keyof ToolDefinitions;
export type ServerToolName = {
  [N in ToolName]: ToolDefinitions[N]["kind"] extends "server" ? N : never;
}[ToolName];
export type ClientToolName = Exclude<ToolName, ServerToolName>;
export type ToolInput<N extends ToolName> = z.infer<ToolDefinitions[N]["input"]>;

/** Fields each web search provider supports, for its model-facing schema. */
export const WEB_SEARCH_FIELDS = {
  firecrawl: ["query", "limit", "recency", "includeDomains", "excludeDomains"],
  jina: ["query", "limit", "site"],
} as const satisfies Record<string, ReadonlyArray<keyof ToolInput<"web_search">>>;

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(toolDefinitions, name);
}

export function isClientTool(name: string): name is ClientToolName {
  return isToolName(name) && toolDefinitions[name].kind === "client";
}
