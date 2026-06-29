import { NextResponse } from "next/server";
import { z } from "zod";

import {
  listSuggestions,
  reconcileSuggestions,
} from "@/components/tiptap/lib/suggestions";
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

const itemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["insert", "delete", "replace"]),
  preview: z.string().max(2000).default(""),
});

const payloadSchema = z.object({
  items: z.array(itemSchema).max(1000),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const userIdOrResponse = await ensureAuthenticated();
  if (userIdOrResponse instanceof NextResponse) {
    return userIdOrResponse;
  }

  const { id } = await context.params;

  try {
    const suggestions = await listSuggestions(id, userIdOrResponse);
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof Error && error.message === "Document not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to list suggestions", error);
    return NextResponse.json(
      { error: "Failed to list suggestions" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const userIdOrResponse = await ensureAuthenticated();
  if (userIdOrResponse instanceof NextResponse) {
    return userIdOrResponse;
  }

  const { id } = await context.params;

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid payload")
        : "Invalid JSON body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await reconcileSuggestions({
      documentId: id,
      userId: userIdOrResponse,
      items: payload.items,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Document not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to reconcile suggestions", error);
    return NextResponse.json(
      { error: "Failed to reconcile suggestions" },
      { status: 500 }
    );
  }
}
