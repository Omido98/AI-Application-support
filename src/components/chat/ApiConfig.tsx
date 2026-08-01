import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatStore, ZEN_DEFAULT_BASE_URL } from "@/stores/chatStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listModels } from "@/utils/api";
import { formatModelPrice, isFreeModel } from "@/utils/zenPricing";
import {
  Settings,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from "lucide-react";

const CUSTOM_MODEL = "__custom__";
const REASONING_OPTIONS = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
];
const inputClass =
  "bg-[#14141f] text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30";

export default function ApiConfig({ onDone }: { onDone?: () => void }) {
  const config = useChatStore((s) => s.config);
  const setConfig = useChatStore((s) => s.setConfig);

  const [baseUrl, setBaseUrl] = useState(
    config.baseUrl || ZEN_DEFAULT_BASE_URL,
  );
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model] = useState(config.model || "");
  const [customModel, setCustomModel] = useState("");
  const [selection, setSelection] = useState<string>(model);
  const [reasoningEffort, setReasoningEffort] = useState(
    config.reasoningEffort ?? "",
  );

  const [models, setModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");

  // Load the model list from the configured endpoint on mount
  const loadModels = useCallback(async (url: string) => {
    const target = url.trim() || ZEN_DEFAULT_BASE_URL;
    setModelsLoading(true);
    setModelsError(null);
    try {
      const list = await listModels(target);
      setModels(list);
    } catch (err) {
      setModels(null);
      setModelsError(err instanceof Error ? err.message : String(err));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels(config.baseUrl || ZEN_DEFAULT_BASE_URL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo(() => {
    const list = [...(models ?? [])];
    if (model && !list.includes(model) && selection !== CUSTOM_MODEL) {
      list.unshift(model);
    }
    return list;
  }, [models, model, selection]);

  const resolvedModel =
    selection === CUSTOM_MODEL ? customModel.trim() : selection;

  const canSave =
    apiKey.trim() !== "" &&
    (selection === CUSTOM_MODEL ? customModel.trim() !== "" : selection !== "");

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestStatus("error");
      setTestMessage("Enter your API key first.");
      return;
    }
    setTestStatus("loading");
    setTestMessage("");
    try {
      const list = await listModels(baseUrl.trim() || ZEN_DEFAULT_BASE_URL);
      setModels(list);
      setTestStatus("success");
      setTestMessage(`Connected — ${list.length} models available.`);
    } catch (err) {
      setTestStatus("error");
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = async () => {
    await setConfig({
      baseUrl: baseUrl.trim() || ZEN_DEFAULT_BASE_URL,
      apiKey: apiKey.trim(),
      model: resolvedModel,
      reasoningEffort: reasoningEffort.trim() !== "" ? reasoningEffort : null,
    });
    onDone?.();
  };

  return (
    <div className="p-6">
      <Card className="bg-surface border-border max-w-lg mx-auto">
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="size-4 text-primary" />
              <span className="text-sm font-medium text-text-primary">
                Configure API
              </span>
            </div>
            {onDone && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDone}
                title="Back to chat"
              >
                <ArrowLeft className="size-4 text-text-secondary" />
              </Button>
            )}
          </div>

          {/* API Base URL */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">API Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={ZEN_DEFAULT_BASE_URL}
              className={inputClass}
            />
            <p className="text-xs text-text-muted">
              OpenCode Zen uses {ZEN_DEFAULT_BASE_URL}. Other
              OpenAI-compatible endpoints also work.
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className={inputClass}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTest}
              disabled={testStatus === "loading"}
              className="mt-1"
            >
              {testStatus === "loading" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Test connection
            </Button>
            {testStatus === "success" && (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle2 className="size-3.5" />
                {testMessage}
              </div>
            )}
            {testStatus === "error" && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <XCircle className="size-3.5" />
                {testMessage}
              </div>
            )}
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-text-secondary text-xs">Model</Label>
              <button
                onClick={() => loadModels(baseUrl)}
                disabled={modelsLoading}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50 select-none"
                title="Reload the model list"
              >
                {modelsLoading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Reload models
              </button>
            </div>

            <Select
              value={selection}
              onValueChange={(v) => setSelection(v ?? "")}
              disabled={modelsLoading}
            >
              <SelectTrigger className="w-full bg-[#14141f] border-border focus-visible:ring-primary/50 data-[size=default]:h-9">
                <SelectValue>
                  {(v) => v ?? "Select a model…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((id) => {
                  const price = formatModelPrice(id);
                  return (
                    <SelectItem key={id} value={id}>
                      <span className="flex items-center justify-between gap-3 flex-1">
                        <span className="truncate">{id}</span>
                        {price && (
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={
                                isFreeModel(id)
                                  ? "text-xs text-green-400 font-medium"
                                  : "text-xs text-text-muted"
                              }
                            >
                              {price}
                            </span>
                            {isFreeModel(id) && (
                              <span className="text-[10px] font-semibold text-green-400 bg-green-400/10 border border-green-400/30 rounded px-1 py-px uppercase tracking-wide">
                                Free
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
                <SelectItem value={CUSTOM_MODEL}>Custom model…</SelectItem>
              </SelectContent>
            </Select>

            {selection === CUSTOM_MODEL && (
              <Input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. deepseek-v4-flash-free"
                className={inputClass}
              />
            )}

            {modelsLoading && (
              <p className="flex items-center gap-1.5 text-xs text-text-muted">
                <Loader2 className="size-3 animate-spin" />
                Loading models…
              </p>
            )}
            {!modelsLoading && modelsError && (
              <p className="text-xs text-destructive">
                Could not load models: {modelsError}
              </p>
            )}
            {!modelsLoading && !modelsError && models && (
              <p className="text-xs text-text-muted">
                {models.length} models available at this endpoint. Prices per 1M
                tokens from{" "}
                <a
                  href="https://opencode.ai/docs/zen"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:text-primary/80"
                >
                  opencode.ai/docs/zen
                </a>{" "}
                — may change.
              </p>
            )}
          </div>

          {/* Reasoning Effort */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">
              Reasoning Effort
            </Label>
            <Select
              value={reasoningEffort}
              onValueChange={(v) => setReasoningEffort(v ?? "")}
            >
              <SelectTrigger className="w-full bg-[#14141f] border-border focus-visible:ring-primary/50 data-[size=default]:h-9">
                <SelectValue>
                  {(v) =>
                    v
                      ? (REASONING_OPTIONS.find((o) => o.value === v)?.label ??
                        v)
                      : "Default"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REASONING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value || "default"} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">
              How much the model should think before answering (like
              opencode's reasoning levels). Support varies by model — if a
              model rejects it, you'll see the error in chat. Default sends
              nothing.
            </p>
          </div>

          <Button
            onClick={handleSave}
            className="w-full bg-primary hover:bg-primary/80 text-primary-foreground"
            disabled={!canSave}
          >
            Save &amp; Connect
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
