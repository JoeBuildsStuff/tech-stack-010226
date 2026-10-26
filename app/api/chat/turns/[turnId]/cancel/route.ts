import { NextResponse, type NextRequest } from "next/server";
import {
  authenticate,
  failTurn,
  getTurn,
} from "@/lib/chat/server/conversation-service";
import { getLiveTurn } from "@/lib/chat/server/turn-bus";
import { cancelLiveTurn } from "@/lib/chat/server/turn-runner";

/** Stop a turn wherever it is running. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ turnId: string }> }
) {
  const { turnId } = await params;
  const auth = await authenticate(request.headers.get("x-chat-account-id"));
  if (auth.error !== undefined)
    return NextResponse.json({ message: auth.error }, { status: 401 });

  const live = getLiveTurn(turnId, auth.data.userId);
  if (live) {
    // The runner records the cancellation with whatever already streamed.
    cancelLiveTurn(live);
    return NextResponse.json({ status: "cancelled" });
  }

  // Running in another instance (it sees the status at its next checkpoint),
  // or waiting for an answer: record the stop directly.
  const turn = await getTurn(auth.data, turnId);
  if (turn.error !== undefined || !turn.data.assistantMessageId)
    return NextResponse.json({ message: turn.error ?? "Chat turn not found" }, { status: 404 });
  const failed = await failTurn(
    auth.data,
    {
      sessionId: turn.data.sessionId,
      turnId,
      assistantMessageId: turn.data.assistantMessageId,
    },
    { status: "cancelled", error: "Response stopped" }
  );
  if (failed.error !== undefined)
    return NextResponse.json({ message: failed.error }, { status: 409 });
  return NextResponse.json({ status: "cancelled" });
}
