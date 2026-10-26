import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toolDefinitions } from "@/lib/chat/tools/definitions";
import { parsePageContext } from "@/lib/chat/contracts";
import { applyTurnEvent, pendingClientToolCalls } from "@/lib/chat/parts";
import {
  authenticate,
  getTurn,
  loadConversation,
  pathThrough,
  resumeTurn,
} from "@/lib/chat/server/conversation-service";
import { startTurn, turnSettled } from "@/lib/chat/server/turn-runner";
import { streamLiveTurn, streamPersistedTurn } from "@/lib/chat/server/turn-stream";

export const maxDuration = 300;

const answerSchema = z.object({
  toolCallId: z.string().min(1),
  output: toolDefinitions.ask_user.output,
});

/**
 * Answer a question the model asked with ask_user, then continue the same
 * reply on the server and stream it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ turnId: string }> }
) {
  const { turnId } = await params;
  const auth = await authenticate(request.headers.get("x-chat-account-id"));
  if (auth.error !== undefined)
    return NextResponse.json({ message: auth.error }, { status: 401 });

  const body = answerSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ message: z.prettifyError(body.error) }, { status: 400 });

  const turn = await getTurn(auth.data, turnId);
  if (turn.error !== undefined)
    return NextResponse.json({ message: turn.error }, { status: 404 });
  const { sessionId, assistantMessageId, userMessageId } = turn.data;
  if (turn.data.status !== "awaiting_input" || !assistantMessageId || !userMessageId)
    return NextResponse.json(
      { message: "This response is not waiting for an answer." },
      { status: 409 }
    );

  const conversation = await loadConversation(auth.data, sessionId);
  if (conversation.error !== undefined)
    return NextResponse.json({ message: conversation.error }, { status: 409 });
  const assistant = conversation.data.messages.find(
    (message) => message.id === assistantMessageId
  );
  const question = assistant
    ? pendingClientToolCalls(assistant.parts).find(
        (call) => call.id === body.data.toolCallId
      )
    : undefined;
  if (!assistant || !question)
    return NextResponse.json(
      { message: "That question was already answered." },
      { status: 409 }
    );

  const parts = applyTurnEvent(assistant.parts, {
    type: "tool-result",
    id: question.id,
    result: { success: true, data: body.data.output },
  });
  const resumed = await resumeTurn(auth.data, { sessionId, turnId }, parts);
  if (resumed.error !== undefined)
    return NextResponse.json({ message: resumed.error }, { status: 409 });

  const path = pathThrough(conversation.data, userMessageId);
  const userMessage = path.at(-1);
  const live = startTurn({
    auth: auth.data,
    turn: { sessionId, turnId, assistantMessageId },
    model: turn.data.model,
    settings: turn.data.settings,
    request: turn.data.request,
    context: parsePageContext(userMessage?.context),
    path,
    initialParts: parts,
    initialCitations: assistant.citations,
  });
  if (!live) return streamPersistedTurn(auth.data, turnId);
  after(() => turnSettled(live));
  return streamLiveTurn(live);
}
