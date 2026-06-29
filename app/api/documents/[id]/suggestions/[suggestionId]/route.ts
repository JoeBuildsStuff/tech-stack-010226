import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveSuggestion } from "@/components/tiptap/lib/suggestions";
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

const patchSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

type RouteContext = {
  params: Promise<{
    id: string;
    suggestionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const userIdOrResponse = await ensureAuthenticated();
  if (userIdOrResponse instanceof NextResponse) {
    return userIdOrResponse;
  }

  const { id, suggestionId } = await context.params;

  let payload: z.infer<typeof patchSchema>;
  try {
    payload = patchSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid payload")
        : "Invalid JSON body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const suggestion = await resolveSuggestion({
      documentId: id,
      suggestionId,
      userId: userIdOrResponse,
      status: payload.status,
    });
    return NextResponse.json({ suggestion });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Document not found" ||
        error.message === "Suggestion not found")
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to update suggestion", error);
    return NextResponse.json(
      { error: "Failed to update suggestion" },
      { status: 500 }
    );
  }
}
