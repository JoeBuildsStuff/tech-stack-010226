import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import {
  WEB_SEARCH_FIELDS,
  isToolName,
  toolDefinitions,
  type ServerToolName,
  type ToolInput,
  type ToolName,
} from "@/lib/chat/tools/definitions";
import type { ToolResult } from "@/lib/chat/contracts";
import {
  executeNotesAddComment,
  executeNotesCreateNote,
  executeNotesGetComments,
  executeNotesGetNote,
  executeNotesListNotes,
  executeNotesReplyToComment,
  executeNotesUpdateNote,
} from "./note-tools";
import { executeFirecrawlScrape, executeFirecrawlSearch } from "./firecrawl-tools";
import { executeJinaScrape, executeJinaSearch } from "./jina-tools";

export type WebSearchProvider = "firecrawl" | "jina";

/**
 * Resolves which shared web search provider to use.
 * WEB_SEARCH_PROVIDER can force `firecrawl` or `jina` when that key is present.
 * Otherwise prefers Firecrawl, then Jina.
 */
export function resolveWebSearchProvider(): WebSearchProvider | null {
  const preferred = process.env.WEB_SEARCH_PROVIDER?.trim().toLowerCase();
  const hasFirecrawl = Boolean(process.env.FIRECRAWL_API_KEY);
  const hasJina = Boolean(process.env.JINA_API_KEY);

  if (preferred === "jina") return hasJina ? "jina" : null;
  if (preferred === "firecrawl") return hasFirecrawl ? "firecrawl" : null;
  if (hasFirecrawl) return "firecrawl";
  if (hasJina) return "jina";
  return null;
}

export type ToolExecutionContext = {
  appBaseUrl?: string;
  supabase?: Awaited<ReturnType<typeof createClient>>;
};

const searchesWithJina = () => resolveWebSearchProvider() === "jina";

/** One executor per server tool, typed by its definition's input schema. */
export const serverToolExecutors = {
  notes_create_note: executeNotesCreateNote,
  notes_list_notes: executeNotesListNotes,
  notes_get_note: executeNotesGetNote,
  notes_get_comments: executeNotesGetComments,
  notes_update_note: executeNotesUpdateNote,
  notes_add_comment: executeNotesAddComment,
  notes_reply_to_comment: executeNotesReplyToComment,
  web_search: (input: ToolInput<"web_search">) =>
    searchesWithJina() ? executeJinaSearch(input) : executeFirecrawlSearch(input),
  web_scrape: (input: ToolInput<"web_scrape">) =>
    searchesWithJina() ? executeJinaScrape(input) : executeFirecrawlScrape(input),
} satisfies {
  [N in ServerToolName]: (
    input: ToolInput<N>,
    context?: ToolExecutionContext
  ) => Promise<ToolResult>;
};

/** A tool as offered to a model: name, description and JSON Schema. */
export interface ToolSpec {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
}

function jsonSchema(schema: z.ZodObject): Record<string, unknown> {
  // Providers want a bare object schema without the meta-schema URI.
  const json: Record<string, unknown> = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
  });
  delete json.$schema;
  return json;
}

/** Tools enabled for a request, in the shape every provider adapter takes. */
export function enabledToolSpecs(options: { webSearchEnabled: boolean }) {
  const webProvider = options.webSearchEnabled ? resolveWebSearchProvider() : null;
  const specs: ToolSpec[] = [];
  for (const name of Object.keys(toolDefinitions)) {
    if (!isToolName(name)) continue;
    const definition = toolDefinitions[name];
    if (name === "web_search" || name === "web_scrape") {
      if (!webProvider) continue;
    }
    let input: z.ZodObject = definition.input;
    if (name === "web_search" && webProvider) {
      const fields = WEB_SEARCH_FIELDS[webProvider];
      const mask: Partial<Record<keyof ToolInput<"web_search">, true>> = {};
      for (const field of fields) mask[field] = true;
      input = toolDefinitions.web_search.input.pick(mask);
    }
    specs.push({
      name,
      description: definition.description,
      parameters: jsonSchema(input),
    });
  }
  return specs;
}

function isServerTool(name: ToolName): name is ServerToolName {
  return toolDefinitions[name].kind === "server";
}

/**
 * Validate a model's arguments and run the tool. Invalid input and executor
 * errors come back as failed results so the model can correct itself.
 */
export async function executeTool(
  name: string,
  args: unknown,
  context: ToolExecutionContext
): Promise<ToolResult> {
  if (!isToolName(name) || !isServerTool(name))
    return { success: false, error: `Unknown function: ${name}` };
  return runServerTool(name, args, context);
}

async function runServerTool<N extends ServerToolName>(
  name: N,
  args: unknown,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const parsed = toolDefinitions[name].input.safeParse(args ?? {});
  if (!parsed.success)
    return {
      success: false,
      error: `Invalid arguments for ${name}: ${z.prettifyError(parsed.error)}`,
    };
  try {
    const executor = serverToolExecutors[name] as (
      input: ToolInput<N>,
      context?: ToolExecutionContext
    ) => Promise<ToolResult>;
    return await executor(parsed.data as ToolInput<N>, context);
  } catch (error) {
    console.error("Function execution error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
