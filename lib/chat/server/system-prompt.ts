import "server-only";
import type { ChatTurnRequest, PageContext } from "@/lib/chat/contracts";

/** The system prompt every provider receives. */
export function buildSystemPrompt(options: {
  request: ChatTurnRequest;
  context: PageContext | null;
  webSearchEnabled: boolean;
}) {
  const { request, context, webSearchEnabled } = options;
  let prompt = `You are a helpful assistant. Use the available tools when appropriate to help users with their requests.

Attachments:
- You can read images and documents the user attaches, including ones from earlier in the conversation
- When an attachment could not be read, say so instead of guessing its contents

Web Search Capabilities:
- Use the available web tools for current, time-sensitive, or externally verifiable information
- Use web_scrape when search result descriptions do not contain enough evidence
- Cite web sources as descriptive Markdown links in your response

Clarifying questions:
- When a request is ambiguous and a wrong guess would waste work, call ask_user with a few short questions instead of guessing

If a tool responds with a url to a record, link to that record using a markdown link whose visible text is the record's own title or name, e.g. [George Washington: Leadership and Legacy](https://app.example.com/dashboard/notes/123). Do not print the raw URL as visible text, and do not append the URL after the title with a dash or other separator (never write "Title — https://...").
When listing multiple records, render each one as its own such markdown link.
When linking to app records in markdown, use the exact absolute URL returned by the tool. Do not rewrite it as a relative path.`;

  if (!webSearchEnabled) {
    prompt += `\n\nWeb access is disabled for this request. Do not claim to have searched or accessed the web.`;
  }

  const { clientTz, clientUtcOffset, clientNowIso, clientPath } = request;
  if (clientTz || clientUtcOffset || clientNowIso) {
    prompt += `\n\nUser Locale Context:\n- Timezone: ${clientTz || "unknown"}\n- UTC offset (at request): ${clientUtcOffset || "unknown"}\n- Local time at request: ${clientNowIso || "unknown"}`;
  }

  if (clientPath) {
    prompt += `\n\nUser Navigation Context:\n- Current path: ${clientPath}\n- If the path is /dashboard/notes/{id}, use that {id} as noteId for note tools.`;
  }

  if (context) {
    prompt += `\n\n## Current Page Context:\n- Total items: ${context.totalCount}\n- Current filters: ${JSON.stringify(context.currentFilters, null, 2)}\n- Current sorting: ${JSON.stringify(context.currentSort, null, 2)}\n- Visible data sample: ${JSON.stringify(context.visibleData.slice(0, 3), null, 2)}`;
  }

  return prompt;
}
