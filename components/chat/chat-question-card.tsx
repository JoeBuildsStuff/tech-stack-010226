"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { chatActions } from "@/hooks/use-chat";
import { useChatStore } from "@/lib/chat/chat-store";
import { pendingClientToolCalls } from "@/lib/chat/parts";
import type { ChatMessage } from "@/lib/chat/contracts";

const OTHER = "__other__";

/** The selected conversation's reply that is waiting on ask_user, if any. */
function useAwaitingReply() {
  return useChatStore((state) => {
    const last = state.messages.at(-1);
    return last?.role === "assistant" && last.status === "awaiting_input"
      ? last
      : null;
  });
}

/**
 * Questions the model asked with ask_user, pinned above the composer.
 * Answering continues the same reply on the server.
 */
export function ChatQuestionCard() {
  const message = useAwaitingReply();
  const call = message ? pendingClientToolCalls(message.parts ?? [])[0] : undefined;
  if (!message || !call) return null;
  return <QuestionForm key={call.id} message={message} call={call} />;
}

function QuestionForm({
  message,
  call,
}: {
  message: ChatMessage;
  call: ReturnType<typeof pendingClientToolCalls>[number];
}) {
  const questions = call.arguments.questions ?? [];
  const [selected, setSelected] = useState<string[]>(() => questions.map(() => ""));
  const [custom, setCustom] = useState<string[]>(() => questions.map(() => ""));
  const [submitting, setSubmitting] = useState(false);

  const answerFor = (index: number) =>
    selected[index] === OTHER ? custom[index].trim() : selected[index];
  const complete = questions.every((_, index) => answerFor(index));

  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    try {
      await chatActions.answerQuestion(message, call.id, {
        answers: questions.map((question, index) => ({
          question: question.question,
          answer: answerFor(index),
        })),
      });
    } catch (error) {
      toast.error("Unable to send your answer", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setSubmitting(false);
    }
  };

  return (
    <form
      className="mx-3 mb-2 flex flex-col gap-4 rounded-2xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {questions.map((question, index) => (
        <fieldset key={index} className="flex flex-col gap-2" disabled={submitting}>
          <legend className="mb-2 font-medium">{question.question}</legend>
          <RadioGroup
            value={selected[index]}
            onValueChange={(value) =>
              setSelected((current) => current.map((item, i) => (i === index ? value : item)))
            }
          >
            {question.choices.map((choice) => (
              <div key={choice} className="flex items-center gap-2">
                <RadioGroupItem value={choice} id={`${call.id}-${index}-${choice}`} />
                <Label htmlFor={`${call.id}-${index}-${choice}`} className="font-normal">
                  {choice}
                </Label>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <RadioGroupItem value={OTHER} id={`${call.id}-${index}-other`} />
              <Input
                aria-label="Your own answer"
                placeholder="Something else…"
                value={custom[index]}
                className="h-8"
                onFocus={() =>
                  setSelected((current) => current.map((item, i) => (i === index ? OTHER : item)))
                }
                onChange={(event) =>
                  setCustom((current) =>
                    current.map((item, i) => (i === index ? event.target.value : item))
                  )
                }
              />
            </div>
          </RadioGroup>
        </fieldset>
      ))}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={submitting}
          onClick={() => void chatActions.stopMessage()}
        >
          Skip
        </Button>
        <Button type="submit" size="sm" disabled={!complete || submitting}>
          {submitting ? "Sending…" : "Answer"}
        </Button>
      </div>
    </form>
  );
}
