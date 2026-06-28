"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { FileImage, Globe, ArrowUp, Square, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/lib/chat/chat-store";
import { AttachmentGroup } from "@/components/ui/attachment";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LowMediumHighIcon } from "@/components/icons/low-medium-high";
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
    value: "claude-haiku-4-5",
    label: "Haiku 4.5",
    menuLabel: "Haiku 4.5 ($1 / $5)",
  },
  {
    value: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    menuLabel: "Sonnet 4.6 ($3 / $15)",
  },
  {
    value: "claude-opus-4-6",
    label: "Opus 4.6",
    menuLabel: "Opus 4.6 ($5 / $25)",
  },
  {
    value: "gpt-oss-120b",
    label: "GPT-OSS-120B",
    menuLabel: "GPT-OSS-120B",
  },
  { value: "gpt-5.4", label: "GPT-5.4", menuLabel: "GPT-5.4 ($2.50 / $15)" },
  { value: "gpt-5", label: "GPT-5", menuLabel: "GPT-5 ($1.25 / $10)" },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    menuLabel: "GPT-5.4 Mini ($0.75 / $4.50)",
  },
  {
    value: "gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    menuLabel: "GPT-5.4 Nano ($0.20 / $1.25)",
  },
] as const;

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
  const [selectedModel, setSelectedModel] = useState("gpt-5");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [reasoningEffort, setReasoningEffort] = useState<
    "low" | "medium" | "high"
  >("low");
  const selectedModelLabel =
    MODEL_OPTIONS.find((option) => option.value === selectedModel)?.label ??
    "Model";

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if ((!trimmedInput && attachments.length === 0) || isLoading) return;

    const messageContent = trimmedInput || "Sent with attachments";
    const currentAttachments = [...attachments];

    setInput("");
    setAttachments([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      // Determine which API to use based on model selection
      const isCerebrasModel = selectedModel.startsWith("gpt-oss-120b");
      const isOpenAIModel = selectedModel.startsWith("gpt-5");

      if (isCerebrasModel || isOpenAIModel) {
        // Use Cerebras or OpenAI API with reasoning effort
        await sendMessage(
          messageContent,
          currentAttachments,
          selectedModel,
          reasoningEffort,
          { webSearchEnabled }
        );
      } else {
        // Use regular chat API (Anthropic)
        await sendMessage(
          messageContent,
          currentAttachments,
          selectedModel,
          undefined,
          { webSearchEnabled }
        );
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
              <Select
                value={selectedModel}
                onValueChange={setSelectedModel}
                disabled={isLoading}
              >
                <SelectTrigger
                  size="sm"
                  className="w-fit border-none text-muted-foreground shadow-none font-light text-xs bg-input/40"
                >
                  <SelectValue placeholder="Model">
                    {selectedModelLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="font-light text-xs"
                    >
                      {option.menuLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Reasoning Effort Selector (show for Cerebras and OpenAI models) */}
              {(selectedModel.startsWith("gpt-oss-120b") ||
                selectedModel.startsWith("gpt-5")) && (
                <Select
                  value={reasoningEffort}
                  onValueChange={(value: "low" | "medium" | "high") =>
                    setReasoningEffort(value)
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-fit border-none text-muted-foreground shadow-none font-light text-xs bg-input/40"
                  >
                    <SelectValue placeholder="Reasoning" />
                  </SelectTrigger>
                  <SelectContent className="font-light text-xs">
                    <SelectItem value="low" className="font-light text-xs">
                      <LowMediumHighIcon level={1} /> Low
                    </SelectItem>
                    <SelectItem value="medium" className="font-light text-xs">
                      <LowMediumHighIcon level={2} /> Medium
                    </SelectItem>
                    <SelectItem value="high" className="font-light text-xs">
                      <LowMediumHighIcon level={3} />
                      High
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}

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
