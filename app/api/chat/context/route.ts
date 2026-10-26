import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/chat/server/conversation-service";
import { estimateContextUsage } from "@/lib/chat/server/context-usage";

const querySchema = z.object({
  sessionId: z.string().uuid().nullish(),
  model: z.string().min(1).max(100),
  webSearch: z.enum(["true", "false"]).default("true"),
  path: z.string().max(2000).optional(),
});

/** Estimated context-window usage for the next message in a conversation. */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request.headers.get("x-chat-account-id"));
  if (auth.error !== undefined)
    return NextResponse.json({ message: auth.error }, { status: 401 });

  const query = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!query.success)
    return NextResponse.json({ message: z.prettifyError(query.error) }, { status: 400 });

  const usage = await estimateContextUsage(auth.data, {
    sessionId: query.data.sessionId ?? null,
    model: query.data.model,
    webSearchEnabled: query.data.webSearch === "true",
    request: { clientPath: query.data.path },
  });
  if ("error" in usage)
    return NextResponse.json({ message: usage.error }, { status: 404 });
  return NextResponse.json(usage.data);
}
