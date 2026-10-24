"use client";

import { useState, useRef, KeyboardEvent } from "react";
import {
  FileImage,
  Globe,
  ArrowUp,
  Square,
  Paperclip,
  ChevronDown,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/lib/chat/chat-store";
import { AttachmentGroup } from "@/components/ui/attachment";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChatAttachmentCard } from "@/components/chat/chat-attachment-card";
import { AttachmentPreviewDialog } from "@/components/chat/attachment-preview-dialog";
import type { ChatAttachmentLike } from "@/lib/chat/attachments";

export interface Attachment extends ChatAttachmentLike {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
}

const MODEL_OPTIONS = [
  {
    value: "claude-haiku-5-5",
    label: "Haiku 5.5",
    cost: "$0.10 / $0.50",
    provider: "Anthropic",
  },
  {
    value: "claude-sonnet-5-5",
    label: "Sonnet 5.5",
    cost: "$2 / $10",
    provider: "Anthropic",
  },
  {
    value: "claude-opus-5-5",
    label: "Opus 5.5",
    cost: "$4 / $20",
    provider: "Anthropic",
  },
  {
    value: "claude-fable-5-1",
    label: "Fable 5.1",
    cost: "$10 / $50",
    provider: "Anthropic",
  },
  {
    value: "gpt-oss-120b",
    label: "GPT-OSS-120B",
    cost: null,
    provider: "Cerebras",
  },
  {
    value: "gpt-6.1-sol",
    label: "GPT-6.1 Sol",
    cost: "$2 / $10",
    provider: "OpenAI",
  },
  {
    value: "gpt-6-astra",
    label: "GPT-6 Astra",
    cost: "$10 / $50",
    provider: "OpenAI",
  },
  {
    value: "gpt-6-luna",
    label: "GPT-6 Luna",
    cost: "$0.10 / $0.50",
    provider: "OpenAI",
  },
  {
    value: "grok-4.5",
    label: "Grok 4.5",
    cost: "$2 / $6",
    provider: "xAI",
  },
] as const;

const MODEL_GROUPS = [
  {
    provider: "Anthropic",
    options: [
      "claude-fable-5-1",
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
    ],
  },
  {
    provider: "OpenAI",
    options: ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"],
  },
  {
    provider: "xAI",
    options: ["grok-4.5"],
  },
  {
    provider: "Cerebras",
    options: ["gpt-oss-120b"],
  },
] as const;

const MODEL_OPTIONS_BY_VALUE = new Map(
  MODEL_OPTIONS.map((option) => [option.value, option])
);

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

const OPENAI_REASONING_OPTIONS: Array<{
  value: ReasoningEffort;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];

const ANTHROPIC_REASONING_OPTIONS: Array<{
  value: ReasoningEffort;
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
  { value: "max", label: "Max" },
];

const CEREBRAS_REASONING_OPTIONS = OPENAI_REASONING_OPTIONS.filter(
  (option) =>
    option.value === "low" ||
    option.value === "medium" ||
    option.value === "high"
);

const XAI_REASONING_OPTIONS = CEREBRAS_REASONING_OPTIONS;

// Effort the Claude API defaults to per model when none is set explicitly.
const ANTHROPIC_DEFAULT_EFFORT: Record<string, ReasoningEffort> = {
  "claude-opus-5-5": "medium",
  "claude-sonnet-5-5": "high",
  "claude-haiku-5-5": "medium",
  "claude-fable-5-1": "high",
};

const MODEL_DEFAULT_EFFORT: Record<string, ReasoningEffort> = {
  ...ANTHROPIC_DEFAULT_EFFORT,
  "gpt-6-astra": "medium",
  "gpt-6.1-sol": "medium",
  "gpt-6-luna": "medium",
  "gpt-oss-120b": "low",
  "grok-4.5": "high",
};

export function ChatInput() {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedAttachment, setSelectedAttachment] =
    useState<ChatAttachmentLike | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, stopMessage } = useChat();
  const { isLoading, layoutMode } = useChatStore();
  const [selectedModel, setSelectedModel] = useState("gpt-6-astra");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    MODEL_DEFAULT_EFFORT["gpt-6-astra"] ?? "medium"
  );
  const isCerebrasModel = selectedModel.startsWith("gpt-oss-120b");
  const isOpenAIModel =
    selectedModel.startsWith("gpt-6") || selectedModel.startsWith("gpt-5");
  const isXAIModel = selectedModel.startsWith("grok-");
  const isAnthropicModel =
    !isCerebrasModel && !isOpenAIModel && !isXAIModel;
  const reasoningOptions = isAnthropicModel
    ? ANTHROPIC_REASONING_OPTIONS
    : isOpenAIModel
      ? OPENAI_REASONING_OPTIONS
      : isXAIModel
        ? XAI_REASONING_OPTIONS
        : CEREBRAS_REASONING_OPTIONS;
  const selectedModelLabel =
    MODEL_OPTIONS.find((option) => option.value === selectedModel)?.label ??
    "Model";
  const selectedEffortLabel =
    reasoningOptions.find((option) => option.value === reasoningEffort)
      ?.label ?? "Medium";

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setReasoningEffort(MODEL_DEFAULT_EFFORT[model] ?? "medium");
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if ((!trimmedInput && attachments.length === 0) || isLoading) return;

    const messageContent = trimmedInput || "Sent with attachments";
    const currentAttachments = [...attachments];
    const account = useChatStore.getState();
    const requestEpoch = account.accountEpoch;
    const requestSessionId = account.currentSessionId;

    setInput("");
    setAttachments([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await sendMessage(
        messageContent,
        currentAttachments,
        selectedModel,
        reasoningEffort,
        { webSearchEnabled }
      );
    } catch (error) {
      const current = useChatStore.getState();
      if (
        current.accountEpoch === requestEpoch &&
        current.currentSessionId === requestSessionId
      ) {
        setInput((value) => value || trimmedInput);
        setAttachments((value) => (value.length ? value : currentAttachments));
        toast.error("Unable to send message", {
          description: error instanceof Error ? error.message : "Please retry.",
        });
      }
    } finally {
      // Focus back to input
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Auto-resize
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  };

  const processFiles = (files: File[]) => {
    const newAttachments: Attachment[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

  const openAttachmentModal = (attachment: ChatAttachmentLike) => {
    setSelectedAttachment(attachment);
  };

  const closeAttachmentModal = () => {
    setSelectedAttachment(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const nextTarget = e.relatedTarget;
    if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  };

  // const canSend = (input.trim().length > 0 || attachments.length > 0) && !isLoading

  return (
    <div className={layoutMode === "fullpage" ? "p-0" : "p-2"}>
      <div
        className={cn(
          "relative flex flex-col overflow-hidden rounded-2xl border border-border bg-muted/50 transition-colors",
          isDragOver && "bg-blue-50 dark:bg-blue-900/20"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Attachments */}
        {attachments.length > 0 && (
          <div
            className={cn(
              "w-full px-2 pt-2 transition-opacity duration-200",
              isDragOver && "pointer-events-none opacity-0"
            )}
          >
            <AttachmentGroup className="gap-2 pb-3">
              {attachments.map((attachment) => (
                <ChatAttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  disabled={isLoading}
                  onPreview={openAttachmentModal}
                  onRemove={removeAttachment}
                />
              ))}
            </AttachmentGroup>
          </div>
        )}

        <div className="relative flex flex-col">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isDragOver ? "" : "Ask question..."}
            disabled={isLoading}
            rows={1}
            className={cn(
              "field-sizing-fixed max-h-[120px] min-h-0 resize-none overflow-y-auto rounded-none border-none bg-transparent px-3 py-2 font-light shadow-none transition-all duration-200 focus-visible:ring-0 dark:bg-transparent",
              attachments.length > 0 && "pt-1",
              isDragOver && "text-transparent"
            )}
          />

          {/* Dashed border overlay when dragging */}
          {isDragOver && (
            <div className="pointer-events-none absolute inset-0.5 z-10 rounded-lg border-2 border-dashed border-blue-400 dark:border-blue-500" />
          )}

          {/* Centered drop text overlay */}
          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="flex items-center gap-2 font-light text-blue-400 dark:text-blue-500">
                <FileImage className="size-4 shrink-0" />
                <span>Drop files here...</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div
            className={cn(
              "flex items-center justify-between gap-2 px-2 pb-2 transition-opacity duration-200",
              isDragOver && "pointer-events-none opacity-0"
            )}
          >
            {/* Left side buttons */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept="*/*"
              />
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-none w-8 bg-input/40"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <Paperclip className="size-4 shrink-0" />
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-8 rounded-full border-none bg-input/40 transition-colors duration-200",
                      webSearchEnabled
                        ? "text-blue-500 hover:text-blue-500"
                        : "text-muted-foreground"
                    )}
                    onClick={() => setWebSearchEnabled((enabled) => !enabled)}
                    disabled={isLoading}
                    aria-label={`Web search ${webSearchEnabled ? "enabled" : "disabled"}`}
                    aria-pressed={webSearchEnabled}
                  >
                    <Globe className="size-4 shrink-0" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  Web search {webSearchEnabled ? "enabled" : "disabled"}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Right side buttons */}
            <div className="flex gap-2 items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    className="w-fit gap-1.5 rounded-full border-none bg-input/40 font-light text-xs text-muted-foreground shadow-none"
                  >
                    <span className="text-foreground">
                      {selectedModelLabel}
                    </span>
                    <span className="text-muted-foreground">
                      {selectedEffortLabel}
                    </span>
                    <ChevronDown className="size-3.5 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="end"
                  sideOffset={8}
                  className="w-56 font-light text-xs"
                >
                  {MODEL_GROUPS.map((group, groupIndex) => (
                    <DropdownMenuGroup key={group.provider}>
                      {groupIndex > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                        {group.provider}
                      </DropdownMenuLabel>
                      {group.options.map((value) => {
                        const option = MODEL_OPTIONS_BY_VALUE.get(value);

                        if (!option) return null;

                        return (
                          <DropdownMenuItem
                            key={option.value}
                            onSelect={() => handleModelChange(option.value)}
                            className="font-light text-xs"
                          >
                            <span className="flex w-full items-center justify-between gap-4">
                              <span>{option.label}</span>
                              {option.cost && (
                                <span className="shrink-0 text-muted-foreground">
                                  {option.cost}
                                </span>
                              )}
                            </span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuGroup>
                  ))}

                  <DropdownMenuSeparator />

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="font-light text-xs [&>svg]:!ml-0">
                      Effort
                      <span className="ml-auto text-muted-foreground">
                        {selectedEffortLabel}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="font-light text-xs">
                      <DropdownMenuRadioGroup
                        value={reasoningEffort}
                        onValueChange={(value) =>
                          setReasoningEffort(value as ReasoningEffort)
                        }
                      >
                        {reasoningOptions.map((option) => (
                          <DropdownMenuRadioItem
                            key={option.value}
                            value={option.value}
                            className="font-light text-xs"
                          >
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Send button */}
              <Button
                type="button"
                onClick={isLoading ? stopMessage : handleSend}
                // disabled={!canSend}
                size="sm"
                variant="blue"
                className={cn(
                  "rounded-full border-none w-8",
                  isLoading ? "[&_svg]:!size-3" : "[&_svg]:!w-5 [&_svg]:!h-5"
                )}
                aria-label={isLoading ? "Stop response" : "Send message"}
              >
                {isLoading ? (
                  <Square className="fill-current" />
                ) : (
                  <ArrowUp className="" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AttachmentPreviewDialog
        attachment={selectedAttachment}
        onOpenChange={closeAttachmentModal}
      />
    </div>
  );
}
