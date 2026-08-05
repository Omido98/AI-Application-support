import { useEffect, useMemo, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStandardPrompt } from "@/utils/systemPrompt";

interface ChatSettingsProps {
  onDone?: () => void;
  /** Opens the general Settings dialog (where the API is configured). */
  onOpenSettings?: () => void;
}

export default function ChatSettings({
  onDone,
  onOpenSettings,
}: ChatSettingsProps) {
  const config = useChatStore((s) => s.config);
  const setConfig = useChatStore((s) => s.setConfig);

  const [webSearchEnabled, setWebSearchEnabled] = useState(
    config.webSearchEnabled ?? true,
  );
  const [promptMode, setPromptMode] = useState(
    config.systemPromptMode ?? "standard",
  );
  const [customPrompt, setCustomPrompt] = useState(
    config.customSystemPrompt ?? "",
  );

  const standardPrompt = useMemo(() => getStandardPrompt(), []);

  useEffect(() => {
    setWebSearchEnabled(config.webSearchEnabled ?? true);
    setPromptMode(config.systemPromptMode ?? "standard");
    setCustomPrompt(config.customSystemPrompt ?? "");
  }, [config.webSearchEnabled, config.systemPromptMode, config.customSystemPrompt]);

  const handleSave = async () => {
    await setConfig({
      webSearchEnabled,
      systemPromptMode: promptMode,
      customSystemPrompt: customPrompt,
    });
    onDone?.();
  };

  return (
    <div className="space-y-4">
      {onOpenSettings && (
        <p className="text-xs text-text-muted">
          Your AI provider, API key and model are configured in{" "}
          <button
            onClick={onOpenSettings}
            className="text-primary hover:text-primary/80 select-none"
          >
            Settings
          </button>
          . The options below only apply to the chat agent.
        </p>
      )}

      {/* Web Search */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <Checkbox
            id="web-search-enabled"
            checked={webSearchEnabled}
            onCheckedChange={(checked) =>
              setWebSearchEnabled(checked === true)
            }
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label
              htmlFor="web-search-enabled"
              className="text-text-secondary text-xs cursor-pointer"
            >
              Web search
            </Label>
            <p className="text-xs text-text-muted">
              Let the chat agent search the web and fetch pages to research the
              company (up to 5 pages per turn). Turn it off if your model keeps
              requesting web tools without answering.
            </p>
          </div>
        </div>
      </div>

      {/* Chat Agent Prompt */}
      <div className="space-y-1.5">
        <Label className="text-text-secondary text-xs">
          Chat Agent Prompt
        </Label>
        <Select
          value={promptMode}
          onValueChange={(v) =>
            setPromptMode((v ?? "standard") as "standard" | "custom")
          }
        >
          <SelectTrigger className="w-full bg-field border-border focus-visible:ring-primary/50 data-[size=default]:h-9">
            <SelectValue>
              {(v) => (v === "custom" ? "Custom prompt" : "Standard prompt")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard prompt</SelectItem>
            <SelectItem value="custom">Custom prompt</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-text-muted">
          The standard prompt is the built-in instructions for the chat agent
          (shown below, read-only). Your profile and application context are
          always appended automatically, so the agent keeps knowing who you are
          and what you're applying for. A custom prompt replaces the built-in
          instructions only.
        </p>

        <Label className="text-text-secondary text-xs">
          Standard prompt (read-only)
        </Label>
        <Textarea
          readOnly
          value={standardPrompt}
          rows={8}
          className="text-xs leading-relaxed bg-field border-border text-text-muted resize-y"
        />

        <Label className="text-text-secondary text-xs">Custom prompt</Label>
        <Textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Write your own instructions for the chat agent…"
          rows={6}
          className="text-xs leading-relaxed bg-field border-border resize-y"
        />
      </div>

      <Button
        onClick={handleSave}
        className="w-full bg-primary hover:bg-primary/80 text-primary-foreground"
      >
        Save
      </Button>
    </div>
  );
}
