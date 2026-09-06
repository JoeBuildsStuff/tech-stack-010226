import { ChatMessage } from "@/types/chat";
import { Button } from "../ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/lib/chat/chat-store";
import { toast } from "sonner";
import { CopyButton } from "@/components/ui/copy-button";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

interface ChatMessageActionsProps {
  message: ChatMessage;
  onEdit?: () => void;
}

export default function ChatMessageActions({
  message,
  onEdit,
}: ChatMessageActionsProps) {
  const { retryMessage, selectBranch, isLoading } = useChat();
  const accountId = useChatStore((state) => state.accountId);
  const accountEpoch = useChatStore((state) => state.accountEpoch);
  const { branchInfo } = message;

  const handleRetry = async () => {
    const requestEpoch = accountEpoch;
    const requestAccountId = accountId;
    try {
      // Pass the rendered message id so the server can preserve this turn's
      // model, reasoning, web-search, and attachment settings.
      await retryMessage(message.id);
      const current = useChatStore.getState();
      if (
        current.accountId !== requestAccountId ||
        current.accountEpoch !== requestEpoch ||
        !current.isAccountReady
      ) {
        return;
      }
      toast.success("Response regenerated");
    } catch (error) {
      const current = useChatStore.getState();
      if (
        current.accountId === requestAccountId &&
        current.accountEpoch === requestEpoch &&
        current.isAccountReady
      ) {
        toast.error("Unable to retry message", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      }
    }
  };

  const handleSelectBranch = async (messageId: string) => {
    try {
      await selectBranch(messageId);
    } catch (error) {
      const current = useChatStore.getState();
      if (
        current.accountId === accountId &&
        current.accountEpoch === accountEpoch
      ) {
        toast.error("Unable to select branch", {
          description: error instanceof Error ? error.message : "Please retry.",
        });
      }
    }
  };

  const handleUpvote = () => {
    // TODO: Implement upvote functionality
    toast.success("Message upvoted");
  };

  const handleDownvote = () => {
    // TODO: Implement downvote functionality
    toast.success("Message downvoted");
  };

  return (
    <TooltipProvider>
      {/* Show copy button for all messages */}
      <div className="flex">
        <CopyButton
          textToCopy={message.content}
          successMessage="Message copied to clipboard"
          tooltipText="Copy"
          tooltipCopiedText="Copied!"
          iconSize={16}
          className="p-2 m-0 h-fit w-fit text-muted-foreground hover:text-primary"
        />

        {/* Show Retry, Upvote, Downvote, and Response navigation for assistant messages */}
        {message.role === "assistant" && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-2 m-0 h-fit w-fit text-muted-foreground"
                  onClick={handleUpvote}
                >
                  <ThumbsUp size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                sideOffset={4}
                className="text-secondary-foreground bg-secondary"
                arrowClassName="bg-secondary fill-secondary"
              >
                Upvote
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-2 m-0 h-fit w-fit text-muted-foreground"
                  onClick={handleDownvote}
                >
                  <ThumbsDown size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                sideOffset={4}
                className="text-secondary-foreground bg-secondary"
                arrowClassName="bg-secondary fill-secondary"
              >
                Downvote
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-2 m-0 h-fit w-fit text-muted-foreground hover:text-primary"
                  onClick={handleRetry}
                  disabled={isLoading}
                >
                  <RotateCcw />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                sideOffset={4}
                className="text-secondary-foreground bg-secondary"
                arrowClassName="bg-secondary fill-secondary"
              >
                Retry
              </TooltipContent>
            </Tooltip>
            {branchInfo && branchInfo.total > 1 && (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-1 m-0 h-fit w-fit text-muted-foreground hover:text-primary"
                  onClick={() =>
                    branchInfo.previousId &&
                    void handleSelectBranch(branchInfo.previousId)
                  }
                  disabled={!branchInfo.previousId || isLoading}
                >
                  <ChevronLeft className="size-5 shrink-0" strokeWidth={1.5} />
                </Button>
                <span className="text-muted-foreground text-sm">
                  {branchInfo.current} / {branchInfo.total}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-1 m-0 h-fit w-fit text-muted-foreground hover:text-primary"
                  onClick={() =>
                    branchInfo.nextId &&
                    void handleSelectBranch(branchInfo.nextId)
                  }
                  disabled={!branchInfo.nextId || isLoading}
                >
                  <ChevronRight className="size-5 shrink-0" strokeWidth={1.5} />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Show Edit for user messages */}
        {message.role === "user" && onEdit && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-2 m-0 h-fit w-fit text-muted-foreground hover:text-primary"
                  onClick={onEdit}
                  disabled={isLoading}
                >
                  <Pencil className="size-4 shrink-0" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                sideOffset={4}
                className="text-secondary-foreground bg-secondary"
                arrowClassName="bg-secondary fill-secondary"
              >
                Edit
              </TooltipContent>
            </Tooltip>
            {branchInfo && branchInfo.total > 1 && (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-1 m-0 h-fit w-fit text-muted-foreground hover:text-primary"
                  onClick={() =>
                    branchInfo.previousId &&
                    void handleSelectBranch(branchInfo.previousId)
                  }
                  disabled={!branchInfo.previousId || isLoading}
                >
                  <ChevronLeft className="size-5 shrink-0" strokeWidth={1.5} />
                </Button>
                <span className="text-muted-foreground text-sm">
                  {branchInfo.current} / {branchInfo.total}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-1 m-0 h-fit w-fit text-muted-foreground hover:text-primary"
                  onClick={() =>
                    branchInfo.nextId &&
                    void handleSelectBranch(branchInfo.nextId)
                  }
                  disabled={!branchInfo.nextId || isLoading}
                >
                  <ChevronRight className="size-5 shrink-0" strokeWidth={1.5} />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
