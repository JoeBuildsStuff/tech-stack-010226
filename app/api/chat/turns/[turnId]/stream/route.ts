import { NextResponse, type NextRequest } from "next/server";
import { authenticate } from "@/lib/chat/server/conversation-service";
import { getLiveTurn } from "@/lib/chat/server/turn-bus";
import { streamLiveTurn, streamPersistedTurn } from "@/lib/chat/server/turn-stream";

export const maxDuration = 300;

/** Re-attach to a turn: from another tab, after a reload, or after a dropped connection. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ turnId: string }> }
) {
  const { turnId } = await params;
  const auth = await authenticate(request.headers.get("x-chat-account-id"));
  if (auth.error !== undefined)
    return NextResponse.json({ message: auth.error }, { status: 401 });

  const live = getLiveTurn(turnId, auth.data.userId);
  return live ? streamLiveTurn(live) : streamPersistedTurn(auth.data, turnId);
}
