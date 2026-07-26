import { useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Pencil } from "lucide-react";

export default function ApiConfig() {
  const config = useChatStore((s) => s.config);
  const configLoaded = useChatStore((s) => s.configLoaded);
  const setConfig = useChatStore((s) => s.setConfig);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [thinkingBudget, setThinkingBudget] = useState(
    config.thinkingBudget?.toString() ?? "",
  );
  const [editing, setEditing] = useState(!config.apiKey);

  // Re-initialise local state when config loads from disk
  if (configLoaded && !editing && !config.apiKey) {
    // If loaded but no key, force edit mode
    setTimeout(() => setEditing(true), 0);
  }

  const handleSave = async () => {
    await setConfig({
      baseUrl: baseUrl || "https://api.opencode.ai/v1",
      apiKey,
      model: model || "deepseek-v4-flash-free",
      thinkingBudget:
        thinkingBudget.trim() !== "" ? Number(thinkingBudget) : null,
    });
    setEditing(false);
  };

  // Mask the API key for display
  const maskedKey =
    config.apiKey.length > 8
      ? config.apiKey.slice(0, 4) + "…" + config.apiKey.slice(-4)
      : config.apiKey
        ? "••••••••"
        : "";

  if (!editing && config.apiKey) {
    return (
      <div className="p-6">
        <Card className="bg-surface border-border max-w-lg mx-auto transition-[border-color] hover:border-primary/20">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="size-4 text-primary" />
                <span className="text-sm font-medium text-text-primary">
                  API Configuration
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditing(true)}
                title="Edit configuration"
              >
                <Pencil className="size-4 text-text-secondary" />
              </Button>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-text-muted">Endpoint</span>
              <p className="text-sm text-text-primary">{config.baseUrl}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-text-muted">API Key</span>
              <p className="text-sm text-text-primary font-mono">{maskedKey}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-text-muted">Model</span>
              <p className="text-sm text-text-primary">{config.model}</p>
            </div>

            {config.thinkingBudget != null && config.thinkingBudget > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-text-muted">
                  Thinking Budget
                </span>
                <p className="text-sm text-text-primary">
                  {config.thinkingBudget}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card className="bg-surface border-border max-w-lg mx-auto">
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="size-4 text-primary" />
            <span className="text-sm font-medium text-text-primary">
              Configure API
            </span>
          </div>

          {/* API Base URL */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">API Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.opencode.ai/v1"
              className="bg-[#14141f] text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className="bg-[#14141f] text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
            />
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">Model</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. deepseek-v4-flash-free"
              className="bg-[#14141f] text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
            />
          </div>

          {/* Thinking Budget */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">
              Thinking Budget
            </Label>
            <Input
              type="number"
              value={thinkingBudget}
              onChange={(e) => setThinkingBudget(e.target.value)}
              placeholder="Optional"
              min={0}
              className="bg-[#14141f] text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
            />
            <p className="text-xs text-text-muted">
              Only supported by some models (e.g., DeepSeek). Leave empty if
              unsure.
            </p>
          </div>

          <Button
            onClick={handleSave}
            className="w-full bg-primary hover:bg-primary/80 text-primary-foreground"
            disabled={!apiKey.trim()}
          >
            Save &amp; Connect
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
