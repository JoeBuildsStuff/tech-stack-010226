"use client";

import { useChatStore } from "@/lib/chat/chat-store";
import { useChat } from "@/hooks/use-chat";
import { ChatMessagesList } from "@/components/chat/chat-messages-list";
import { ChatInput } from "@/components/chat/chat-input";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PictureInPicture2, PanelRight, LaptopMinimal } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function ChatFullPage() {
  const { setLayoutMode } = useChatStore();
  const router = useRouter();

  const { handleActionClick } = useChat({
    onActionClick: (action) => {
      // Handle different action types
      switch (action.type) {
        case "filter":
          // Apply filter to current page
          const filterParams = new URLSearchParams(window.location.search);
          filterParams.set(
            `${action.payload.columnId}`,
            String(action.payload.value)
          );
          router.push(`${window.location.pathname}?${filterParams.toString()}`);
          break;

        case "sort":
          // Apply sorting to current page
          const sortParams = new URLSearchParams(window.location.search);
          sortParams.set("sortBy", String(action.payload.columnId));
          sortParams.set("sortOrder", String(action.payload.direction));
          router.push(`${window.location.pathname}?${sortParams.toString()}`);
          break;

        case "navigate":
          // Navigate to different page
          const targetPath = action.payload.clearFilters
            ? String(action.payload.pathname)
            : `${action.payload.pathname}?${window.location.search}`;
          router.push(targetPath);
          break;

        case "create":
          // Handle create actions (could open forms, etc.)
          toast.success(`Action: ${action.label}`);
          break;

        case "function_call":
          // Function calls are handled by the API, just show feedback
          toast.success(`Executed: ${action.label}`);
          // Refresh the page to show new data
          router.refresh();
          break;

        default:
          console.log("Unknown action type:", action);
      }
    },
  });

  const handleBackToFloating = () => {
    setLayoutMode("floating");
    router.push("/workspace");
  };

  const handleBackToInset = () => {
    setLayoutMode("inset");
    router.push("/workspace");
  };

  const handleBackToFullpage = () => {
    // Already in fullpage, do nothing or could refresh
    router.refresh();
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Layout mode toggle group */}
      <div className="absolute top-0 left-0 z-10 flex items-center justify-center">
        <ToggleGroup
          type="single"
          defaultValue="fullpage"
          className="bg-background/95 backdrop-blur border rounded-lg"
        >
          <ToggleGroupItem
            value="floating"
            onClick={handleBackToFloating}
            aria-label="Floating mode"
          >
            <PictureInPicture2 className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="inset"
            onClick={handleBackToInset}
            aria-label="Inset mode"
          >
            <PanelRight className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="fullpage"
            onClick={handleBackToFullpage}
            aria-label="Full page mode"
          >
            <LaptopMinimal className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Chat Content */}
      <div className="flex-1 flex flex-col min-h-0 max-w-3xl mx-auto w-full">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col min-h-0">
          <MessageScrollerProvider autoScroll defaultScrollPosition="end">
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent>
                  <ChatMessagesList onActionClick={handleActionClick} />
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        </div>
        {/* Input Area */}
        <div className="">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}
