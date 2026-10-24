import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import { InputGroupTextarea } from "@/components/ui/input-group";
import {
  ArrowUp,
  ChevronDown,
  Check,
  Plus,
  ClockFading,
  LayoutGrid,
  Feather,
  SearchCheck,
  Globe,
  Paperclip,
  Camera,
  Folders,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface ChatInputProps {
  hoveredPromptText?: string | null;
  selectedPromptText?: string | null;
}

export function ChatInput({
  hoveredPromptText,
  selectedPromptText,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const previousValueRef = useRef("");
  const lastHoveredTextRef = useRef<string | null>(null);
  const isHoveringRef = useRef(false);

  // Handle prompt selection (on click) - this takes priority over hover
  useEffect(() => {
    if (selectedPromptText) {
      setValue((currentValue) => {
        previousValueRef.current = currentValue;
        return selectedPromptText;
      });
      // Clear hover state when a prompt is selected
      isHoveringRef.current = false;
      lastHoveredTextRef.current = null;
    }
  }, [selectedPromptText]);

  // Handle prompt hover (on mouse enter/leave)
  useEffect(() => {
    if (hoveredPromptText) {
      // When hovering over a prompt, save current value and set the hover text
      if (!isHoveringRef.current) {
        setValue((currentValue) => {
          previousValueRef.current = currentValue;
          return hoveredPromptText;
        });
      } else {
        setValue(hoveredPromptText);
      }
      isHoveringRef.current = true;
      lastHoveredTextRef.current = hoveredPromptText;
    } else if (hoveredPromptText === null && isHoveringRef.current) {
      // When hovering away, only revert if the current value matches the hovered text
      // This allows user typing to be preserved
      isHoveringRef.current = false;
      setValue((currentValue) => {
        if (currentValue === lastHoveredTextRef.current) {
          return previousValueRef.current;
        }
        return currentValue;
      });
      lastHoveredTextRef.current = null;
    }
  }, [hoveredPromptText]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* chat input */}
      <InputGroup className="rounded-2xl mt-6 p-1.5 bg-[#FFFFFF] dark:bg-[#30302E] border-border dark:border-border dark:border-[0.5px] border shadow-none">
        <InputGroupTextarea
          placeholder="How can I help you today?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <div className="flex flex-row items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <InputGroupButton variant="ghost" size="icon-sm">
                  <Plus className="size-5" />
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="start"
                className="rounded-xl"
              >
                <DropdownMenuItem>
                  <Paperclip className="size-4 rotate-290" />
                  Add files or photos
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Camera className="size-4" />
                  Take a screenshot
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Folders className="size-4" />
                    Add to project
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    add to project here
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 256 229"
                      width="16"
                      height="16"
                      style={{ opacity: 1 }}
                    >
                      <path
                        fill="#0066DA"
                        d="m19.354 196.034l11.29 19.5c2.346 4.106 5.718 7.332 9.677 9.678q17.009-21.591 23.68-33.137q6.77-11.717 16.641-36.655q-26.604-3.502-40.32-3.502q-13.165 0-40.322 3.502c0 4.545 1.173 9.09 3.519 13.196z"
                      />
                      <path
                        fill="#EA4335"
                        d="M215.681 225.212c3.96-2.346 7.332-5.572 9.677-9.677l4.692-8.064l22.434-38.855a26.57 26.57 0 0 0 3.518-13.196q-27.315-3.502-40.247-3.502q-13.899 0-40.248 3.502q9.754 25.075 16.422 36.655q6.724 11.683 23.752 33.137"
                      />
                      <path
                        fill="#00832D"
                        d="M128.001 73.311q19.68-23.768 27.125-36.655q5.996-10.377 13.196-33.137C164.363 1.173 159.818 0 155.126 0h-54.25C96.184 0 91.64 1.32 87.68 3.519q9.16 26.103 15.544 37.154q7.056 12.213 24.777 32.638"
                      />
                      <path
                        fill="#2684FC"
                        d="M175.36 155.42H80.642l-40.32 69.792c3.958 2.346 8.503 3.519 13.195 3.519h148.968c4.692 0 9.238-1.32 13.196-3.52z"
                      />
                      <path
                        fill="#00AC47"
                        d="M128.001 73.311L87.681 3.52c-3.96 2.346-7.332 5.571-9.678 9.677L3.519 142.224A26.57 26.57 0 0 0 0 155.42h80.642z"
                      />
                      <path
                        fill="#FFBA00"
                        d="m215.242 77.71l-37.243-64.514c-2.345-4.106-5.718-7.331-9.677-9.677l-40.32 69.792l47.358 82.109h80.496c0-4.546-1.173-9.09-3.519-13.196z"
                      />
                    </svg>
                    Add from Google Drive
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    Connectors here
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 256 250"
                      width="24"
                      height="24"
                      style={{ opacity: 1 }}
                      className="dark:[&>path]:fill-white [&>path]:fill-black"
                    >
                      <path d="M128.001 0C57.317 0 0 57.307 0 128.001c0 56.554 36.676 104.535 87.535 121.46c6.397 1.185 8.746-2.777 8.746-6.158c0-3.052-.12-13.135-.174-23.83c-35.61 7.742-43.124-15.103-43.124-15.103c-5.823-14.795-14.213-18.73-14.213-18.73c-11.613-7.944.876-7.78.876-7.78c12.853.902 19.621 13.19 19.621 13.19c11.417 19.568 29.945 13.911 37.249 10.64c1.149-8.272 4.466-13.92 8.127-17.116c-28.431-3.236-58.318-14.212-58.318-63.258c0-13.975 5-25.394 13.188-34.358c-1.329-3.224-5.71-16.242 1.24-33.874c0 0 10.749-3.44 35.21 13.121c10.21-2.836 21.16-4.258 32.038-4.307c10.878.049 21.837 1.47 32.066 4.307c24.431-16.56 35.165-13.12 35.165-13.12c6.967 17.63 2.584 30.65 1.255 33.873c8.207 8.964 13.173 20.383 13.173 34.358c0 49.163-29.944 59.988-58.447 63.157c4.591 3.972 8.682 11.762 8.682 23.704c0 17.126-.148 30.91-.148 35.126c0 3.407 2.304 7.398 8.792 6.14C219.37 232.5 256 184.537 256 128.002C256 57.307 198.691 0 128.001 0m-80.06 182.34c-.282.636-1.283.827-2.194.39c-.929-.417-1.45-1.284-1.15-1.922c.276-.655 1.279-.838 2.205-.399c.93.418 1.46 1.293 1.139 1.931m6.296 5.618c-.61.566-1.804.303-2.614-.591c-.837-.892-.994-2.086-.375-2.66c.63-.566 1.787-.301 2.626.591c.838.903 1 2.088.363 2.66m4.32 7.188c-.785.545-2.067.034-2.86-1.104c-.784-1.138-.784-2.503.017-3.05c.795-.547 2.058-.055 2.861 1.075c.782 1.157.782 2.522-.019 3.08m7.304 8.325c-.701.774-2.196.566-3.29-.49c-1.119-1.032-1.43-2.496-.726-3.27c.71-.776 2.213-.558 3.315.49c1.11 1.03 1.45 2.505.701 3.27m9.442 2.81c-.31 1.003-1.75 1.459-3.199 1.033c-1.448-.439-2.395-1.613-2.103-2.626c.301-1.01 1.747-1.484 3.207-1.028c1.446.436 2.396 1.602 2.095 2.622m10.744 1.193c.036 1.055-1.193 1.93-2.715 1.95c-1.53.034-2.769-.82-2.786-1.86c0-1.065 1.202-1.932 2.733-1.958c1.522-.03 2.768.818 2.768 1.868m10.555-.405c.182 1.03-.875 2.088-2.387 2.37c-1.485.271-2.861-.365-3.05-1.386c-.184-1.056.893-2.114 2.376-2.387c1.514-.263 2.868.356 3.061 1.403" />
                    </svg>
                    Add from Github
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    Connectors here
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator className="mx-1 my-2" />
                <DropdownMenuItem>
                  <SearchCheck className="size-4" />
                  Research
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Globe className="size-4 -rotate-20" />
                  Websearch
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Feather className="size-4" />
                    Use Style
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    Connectors here
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <LayoutGrid className="size-4" />
                    Connectors
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    Connectors here
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <InputGroupButton variant="ghost" className="" size="icon-sm">
              <ClockFading className="size-4" />
            </InputGroupButton>
          </div>
          <div className="flex flex-row items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <InputGroupButton variant="ghost" size="sm">
                  Opus 5.5{" "}
                  <ChevronDown className="size-4 text-muted-foreground ml-auto" />
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="end"
                className="rounded-xl"
              >
                <DropdownMenuItem className="flex flex-row items-center">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-sm">Opus 5.5</span>
                    <span className="text-xs text-muted-foreground">
                      Long-running agentic coding and knowledge work
                    </span>
                  </div>
                  {/* Check icon twice, vertically centered in the middle */}
                  <div className="flex flex-col justify-center items-center h-full ml-2">
                    <Check className="size-4 mb-1 text-blue-500" />
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col gap-1 items-start">
                  <span className="text-sm">Sonnet 5.5</span>
                  <span className="text-xs text-muted-foreground">
                    Best combination of speed and intelligence
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col gap-1 items-start">
                  <span className="text-sm">Haiku 5.5</span>
                  <span className="text-xs text-muted-foreground">
                    Fastest for high-volume, latency-sensitive tasks
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="mx-1 my-2" />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  More models
                </DropdownMenuLabel>
                <DropdownMenuItem>claude-fable-5-1</DropdownMenuItem>
                <DropdownMenuItem>claude-opus-5-5</DropdownMenuItem>
                <DropdownMenuItem>claude-sonnet-5-5</DropdownMenuItem>
                <DropdownMenuItem>claude-haiku-5-5</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <InputGroupButton
              variant="default"
              size="icon-sm"
              className="bg-[#D97757]/60 text-foreground hover:bg-[#D97757]/80"
            >
              <ArrowUp className="size-4 text-white" />
            </InputGroupButton>
          </div>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
