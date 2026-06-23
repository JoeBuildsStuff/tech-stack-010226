import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { NextRequest, NextResponse } from "next/server";

import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { createClient } from "@/lib/supabase/server";

const TITLE_MODEL = "gpt-oss-120b";
const DEFAULT_TITLE = "New Chat";

type NonStreamingTitleCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function cleanTitle(value: string): string {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .split("\n")[0]
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .slice(0, 60)
    .trim();
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json()) as {
    sessionId?: unknown;
    message?: unknown;
  };
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!sessionId || !message) {
    return NextResponse.json(
      { error: "sessionId and message are required" },
      { status: 400 }
    );
  }

  const { data: session, error: sessionError } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .select("id, title")
    .eq("id", sessionId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  if (session.title !== DEFAULT_TITLE) {
    return NextResponse.json({ title: session.title, skipped: true });
  }

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cerebras API key is not configured" },
      { status: 503 }
    );
  }

  try {
    const cerebras = new Cerebras({ apiKey });
    const completion = (await cerebras.chat.completions.create({
      model: TITLE_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Write a concise title for a chat from its first user message. Return only the title: 3-7 words, plain text, no quotes, no punctuation at the end.",
        },
        { role: "user", content: message.slice(0, 4000) },
      ],
      max_completion_tokens: 40,
      temperature: 0.2,
      stream: false,
    })) as NonStreamingTitleCompletion;

    const generated = completion.choices?.[0]?.message?.content;
    const title = cleanTitle(typeof generated === "string" ? generated : "");
    if (!title) {
      return NextResponse.json(
        { error: "Cerebras returned an empty title" },
        { status: 502 }
      );
    }

    // Only replace the default title so a manual rename always wins a race.
    const { data: updated, error: updateError } = await supabase
      .schema(APP_SCHEMA)
      .from("chat_sessions")
      .update({ title })
      .eq("id", sessionId)
      .eq("user_id", userData.user.id)
      .eq("title", DEFAULT_TITLE)
      .select("title")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ title: updated?.title ?? session.title });
  } catch (error) {
    console.error("Failed to generate chat title with Cerebras:", error);
    return NextResponse.json(
      { error: "Failed to generate chat title" },
      { status: 502 }
    );
  }
}
