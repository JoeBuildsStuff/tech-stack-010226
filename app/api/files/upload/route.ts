import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const CHAT_FILES_BUCKET = "chat-files";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File is larger than 25MB" },
      { status: 400 }
    );
  }

  const pathPrefix = String(formData.get("pathPrefix") || "chat");
  const filePath = `${pathPrefix}/${user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(CHAT_FILES_BUCKET)
    .upload(filePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    filePath,
    url: filePath,
  });
}
