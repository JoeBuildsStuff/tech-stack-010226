import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const CHAT_FILES_BUCKET = "chat-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const filePath = request.nextUrl.searchParams.get("path");
  if (!filePath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  if (!filePath.includes(`/${user.id}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.storage
    .from(CHAT_FILES_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message || "Unable to create signed URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    fileUrl: data.signedUrl,
    url: data.signedUrl,
  });
}
