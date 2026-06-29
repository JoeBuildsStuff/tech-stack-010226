import { NextResponse } from "next/server";
import { z } from "zod";

import { createSuggestionReply } from "@/components/tiptap/lib/suggestions";
import { createClient } from "@/lib/supabase/server";

async function ensureAuthenticated(): Promise<string | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user.id;
}

const createSchema = z.object({
  content: z.string().trim().min(1).max(10000),
  kind: z.enum(["insert", "delete", "replace"]),
  preview: z.string().max(2000).default(""),
});

type RouteContext = {
  params: Promise<{
    id: string;
    suggestionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const userIdOrResponse = await ensureAuthenticated();
  if (userIdOrResponse instanceof NextResponse) {
    return userIdOrResponse;
  }

  const { id, suggestionId } = await context.params;

  let payload: z.infer<typeof createSchema>;
  try {
    payload = createSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid payload")
        : "Invalid JSON body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const reply = await createSuggestionReply({
      documentId: id,
      suggestionId,
      userId: userIdOrResponse,
      content: payload.content,
      kind: payload.kind,
      preview: payload.preview,
    });

    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Document not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof Error &&
      error.message === "Comment content is required"
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to create suggestion reply", error);
    return NextResponse.json(
      { error: "Failed to create suggestion reply" },
      { status: 500 }
    );
  }
}
