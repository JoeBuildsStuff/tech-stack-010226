"use client";

import { useState, useRef, KeyboardEvent } from "react";
import {
  FileText,
  FileVideo,
  File,
  FileArchive,
  FileSpreadsheet,
  Headphones,
  Image,
  FileImage,
  Globe,
  X,
  ArrowUp,
  Paperclip,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/lib/chat/chat-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LowMediumHighIcon } from "@/components/icons/low-medium-high";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import Spinner from "@/components/ui/spinner";

export interface Attachment {
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
    useState<Attachment | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage } = useChat();
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

  const openAttachmentModal = (attachment: Attachment) => {
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

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const getFileIcon = (attachment: Attachment) => {
    const fileType = attachment.type;
    const fileName = attachment.name;

    const iconMap = {
      pdf: {
        icon: FileText,
        conditions: (type: string, name: string) =>
          type.includes("pdf") ||
          name.endsWith(".pdf") ||
          type.includes("word") ||
          name.endsWith(".doc") ||
          name.endsWith(".docx"),
      },
      archive: {
        icon: FileArchive,
        conditions: (type: string, name: string) =>
          type.includes("zip") ||
          type.includes("archive") ||
          name.endsWith(".zip") ||
          name.endsWith(".rar"),
      },
      excel: {
        icon: FileSpreadsheet,
        conditions: (type: string, name: string) =>
          type.includes("excel") ||
          name.endsWith(".xls") ||
          name.endsWith(".xlsx"),
      },
      video: {
        icon: FileVideo,
        conditions: (type: string) => type.includes("video/"),
      },
      audio: {
        icon: Headphones,
        conditions: (type: string) => type.includes("audio/"),
      },
      image: {
        icon: Image,
        conditions: (type: string) => type.startsWith("image/"),
      },
    };

    for (const { icon: Icon, conditions } of Object.values(iconMap)) {
      if (conditions(fileType, fileName)) {
        return <Icon className="size-5 opacity-60" />;
      }
    }

    return <File className="size-5 opacity-60" />;
  };

  const getFilePreview = (attachment: Attachment) => {
    const fileType = attachment.type;

    return (
      <div className="bg-accent flex aspect-square items-center justify-center overflow-hidden rounded-t-[inherit]">
        {fileType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={URL.createObjectURL(attachment.file)}
            alt={attachment.name}
            className="size-full rounded-t-[inherit] object-cover"
          />
        ) : (
          getFileIcon(attachment)
        )}
      </div>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // const canSend = (input.trim().length > 0 || attachments.length > 0) && !isLoading

  return (
    <div className={layoutMode === "fullpage" ? "p-0" : "p-2"}>
      <div className="border border-border rounded-xl">
        <div className="relative flex flex-col overflow-hidden rounded-xl bg-muted/50">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            placeholder={isDragOver ? "" : "Ask question..."}
            disabled={isLoading}
            rows={1}
            className={cn(
              "field-sizing-fixed max-h-[120px] min-h-0 resize-none overflow-y-auto rounded-none border-none bg-transparent px-3 py-2 font-light shadow-none transition-all duration-200 focus-visible:ring-0 dark:bg-transparent",
              isDragOver && "bg-blue-50 text-transparent dark:bg-blue-900/20"
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
                onClick={handleSend}
                // disabled={!canSend}
                size="sm"
                variant="blue"
                className="rounded-full border-none w-8 [&_svg]:!w-5 [&_svg]:!h-5"
              >
                {isLoading ? <Spinner variant="blue" /> : <ArrowUp />}
              </Button>
            </div>
          </div>
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="w-full p-2">
            <div className="flex w-full flex-col">
              <div className="flex gap-4 overflow-x-auto pt-2 pb-1">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="bg-background relative flex flex-col rounded-md border group min-w-[120px] max-w-[120px] flex-shrink-0 cursor-pointer"
                    onClick={() => openAttachmentModal(attachment)}
                  >
                    {getFilePreview(attachment)}
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAttachment(attachment.id);
                      }}
                      size="icon"
                      variant="secondary"
                      className="absolute -top-2 -right-2 size-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      aria-label="Remove file"
                      disabled={isLoading}
                    >
                      <X className="size-4" />
                    </Button>
                    <div className="flex min-w-0 flex-col gap-0.5 border-t p-2">
                      <p className="truncate text-[11px] font-medium">
                        {attachment.name}
                      </p>
                      <p className="text-muted-foreground truncate text-[10px]">
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Attachment Preview Modal */}
      <Dialog open={!!selectedAttachment} onOpenChange={closeAttachmentModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <div className="relative">
            {selectedAttachment && (
              <div className="flex flex-col">
                {/* File Header */}
                <div className="flex items-center gap-3 p-4 border-b">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium truncate">
                      {selectedAttachment.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedAttachment.type} •{" "}
                      {formatFileSize(selectedAttachment.size)}
                    </p>
                  </div>
                </div>

                {/* File Content */}
                <div className="flex-1 overflow-auto">
                  {selectedAttachment.type.startsWith("image/") ? (
                    <div className="flex items-center justify-center p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={URL.createObjectURL(selectedAttachment.file)}
                        alt={selectedAttachment.name}
                        className="max-w-full max-h-[70vh] object-contain rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-8">
                      <div className="text-center">
                        {getFileIcon(selectedAttachment)}
                        <p className="mt-2 text-sm text-muted-foreground">
                          Preview not available for this file type
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedAttachment.name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
