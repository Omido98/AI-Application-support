import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import {
  PROVIDERS,
  getProvider,
  detectProviderFromKey,
  type ProviderId,
} from "@/utils/providers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listModels,
  fetchZenPricing,
  type ZenPricingEntry,
} from "@/utils/api";
import {
  formatModelPrice,
  isFreeModel,
  type ModelPrice,
} from "@/utils/zenPricing";
import { getStandardPrompt } from "@/utils/systemPrompt";
import { saveJson, loadJson } from "@/utils/storage";
import {
  Settings,
  RefreshCw,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  "bg-field text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30";

export default function ApiConfig({ onDone }: { onDone?: () => void }) {
  const config = useChatStore((s) => s.config);
  const setConfig = useChatStore((s) => s.setConfig);

  const [provider, setProvider] = useState<ProviderId>(
    config.provider ?? "zen",
  );
  const [baseUrl, setBaseUrl] = useState(
    config.baseUrl || getProvider(config.provider ?? "zen").defaultBaseUrl,
  );
  const [urlCustomized, setUrlCustomized] = useState(false);
  const [detectedProvider, setDetectedProvider] =
    useState<ProviderId | null>(null);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model] = useState(config.model || "");
  const [customModel, setCustomModel] = useState("");
  const [selection, setSelection] = useState<string>(model);
  const [reasoningEffort, setReasoningEffort] = useState(
    config.reasoningEffort ?? "",
  );
  const [promptMode, setPromptMode] = useState(
    config.systemPromptMode ?? "standard",
  );
  const [customPrompt, setCustomPrompt] = useState(
    config.customSystemPrompt ?? "",
  );

  const [models, setModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [pricing, setPricing] = useState<ZenPricingEntry[]>([]);
  const [pricingStatus, setPricingStatus] = useState<string | null>(null);

  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");

  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);

  const standardPrompt = useMemo(() => getStandardPrompt(), []);

  const fetchedPrices = useMemo(() => {
    const map: Record<string, ModelPrice> = {};
    for (const entry of pricing) {
      if (!entry.is_free && entry.input != null && entry.output != null) {
        map[entry.id] = { input: entry.input, output: entry.output };
      }
    }
    return map;
  }, [pricing]);

  const fetchedFree = useMemo(
    () => new Set(pricing.filter((p) => p.is_free).map((p) => p.id)),
    [pricing],
  );

  // Load the model list (and Zen prices when applicable) for a provider
  const loadModels = useCallback(
    async (
      url: string,
      p: ProviderId = provider,
      key = apiKey.trim(),
    ): Promise<boolean> => {
      const target = url.trim() || getProvider(p).defaultBaseUrl;
      setModelsLoading(true);
      setModelsError(null);
      setPricingStatus(null);
      try {
        const list = await listModels(target, key, p);
        setModels(list);
      } catch (err) {
        setModels(null);
        setModelsError(err instanceof Error ? err.message : String(err));
      }
      let pricesOk = false;
      if (getProvider(p).hasZenPricing) {
        try {
          const entries = await fetchZenPricing();
          setPricing(entries);
          setPricingStatus(`Prices imported for ${entries.length} models`);
          await saveJson("zen-prices.json", entries);
          pricesOk = true;
        } catch (err) {
          setPricingStatus(err instanceof Error ? err.message : String(err));
        }
      }
      setModelsLoading(false);
      return pricesOk;
    },
    [apiKey, provider],
  );

  useEffect(() => {
    let stale = false;
    void (async () => {
      const initialProvider = config.provider ?? "zen";
      const pricesOk = await loadModels(
        config.baseUrl || getProvider(initialProvider).defaultBaseUrl,
        initialProvider,
      );
      if (stale || pricesOk) return;
      if (!getProvider(initialProvider).hasZenPricing) return;
      const cached = await loadJson<ZenPricingEntry[]>("zen-prices.json");
      if (cached && cached.length > 0) {
        setPricing(cached);
        setPricingStatus(`Using ${cached.length} prices from a previous import`);
      }
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo(() => {
    const list = [...(models ?? [])];
    if (
      config.provider === provider &&
      model &&
      !list.includes(model) &&
      selection !== CUSTOM_MODEL
    ) {
      list.unshift(model);
    }
    // Put free models first (Zen only — pricing is unknown elsewhere).
    // Array.sort is stable, so relative order is preserved within groups.
    if (provider === "zen") {
      list.sort((a, b) => {
        const freeA = isFreeModel(a) || fetchedFree.has(a);
        const freeB = isFreeModel(b) || fetchedFree.has(b);
        return Number(freeB) - Number(freeA);
      });
    }
    return list;
  }, [models, model, selection, provider, config.provider, fetchedFree]);

  const resolvedModel =
    selection === CUSTOM_MODEL ? customModel.trim() : selection;

  const canSave =
    apiKey.trim() !== "" &&
    (selection === CUSTOM_MODEL ? customModel.trim() !== "" : selection !== "");

  /** Whether picking this model needs no confirmation (free or unknown). */
  const isFreeChoice = (id: string): boolean => {
    if (id === CUSTOM_MODEL) return true;
    if (provider !== "zen") return true;
    return isFreeModel(id) || fetchedFree.has(id);
  };

  const handleModelSelect = (id: string) => {
    if (isFreeChoice(id)) {
      setSelection(id);
      return;
    }
    setPendingSelection(id);
    setConfirmPaidOpen(true);
  };

  const confirmPaidSelection = () => {
    if (pendingSelection) setSelection(pendingSelection);
    setPendingSelection(null);
    setConfirmPaidOpen(false);
  };

  const declinePaidSelection = () => {
    setPendingSelection(null);
    setConfirmPaidOpen(false);
  };

  /** Switch to a provider: fill its default URL + model and reload the list. */
  const applyProvider = (p: ProviderId, keyOverride?: string) => {
    setProvider(p);
    const def = getProvider(p);
    setBaseUrl(def.defaultBaseUrl);
    setSelection(def.defaultModel);
    setUrlCustomized(false);
    const key = keyOverride ?? apiKey.trim();
    void loadModels(def.defaultBaseUrl, p, key);
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    const detected = detectProviderFromKey(value);
    setDetectedProvider(detected);
    if (detected && detected !== provider && !urlCustomized) {
      applyProvider(detected, value);
    }
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestStatus("error");
      setTestMessage("Enter your API key first.");
      return;
    }
    setTestStatus("loading");
    setTestMessage("");
    try {
      const list = await listModels(
        baseUrl.trim() || getProvider(provider).defaultBaseUrl,
        apiKey.trim(),
        provider,
      );
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
      provider,
      baseUrl: baseUrl.trim() || getProvider(provider).defaultBaseUrl,
      apiKey: apiKey.trim(),
      model: resolvedModel,
      reasoningEffort: reasoningEffort.trim() !== "" ? reasoningEffort : null,
      systemPromptMode: promptMode,
      customSystemPrompt: customPrompt,
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

          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => applyProvider((v ?? "zen") as ProviderId)}
            >
              <SelectTrigger className="w-full bg-field border-border focus-visible:ring-primary/50 data-[size=default]:h-9">
                <SelectValue>
                  {(v) => getProvider((v as ProviderId) || provider).label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* API Base URL */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">API Base URL</Label>
            <div className="flex gap-2">
              <Input
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setUrlCustomized(true);
                }}
                placeholder={getProvider(provider).defaultBaseUrl}
                className={inputClass}
              />
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => setBaseUrl(getProvider(provider).defaultBaseUrl)}
                title="Reset to the provider's default URL"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              {provider === "zen" ? (
                <>
                  OpenCode Zen uses {getProvider("zen").defaultBaseUrl}. Other
                  OpenAI-compatible endpoints also work.
                </>
              ) : (
                <>
                  {getProvider(provider).label}'s default URL is filled in
                  automatically when you switch providers. You can edit it for
                  custom endpoints — Reset restores the default.
                </>
              )}
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder={
                getProvider(provider).keyPrefixes[0]
                  ? `${getProvider(provider).keyPrefixes[0]}…`
                  : "sk-…"
              }
              className={inputClass}
            />
            {detectedProvider && detectedProvider !== provider && (
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                Detected {getProvider(detectedProvider).label} key.
                <button
                  onClick={() => applyProvider(detectedProvider)}
                  className="text-primary hover:text-primary/80 select-none"
                >
                  Switch provider
                </button>
              </div>
            )}
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
              onValueChange={(v) => handleModelSelect(v ?? "")}
              disabled={modelsLoading}
            >
              <SelectTrigger className="w-full bg-field border-border focus-visible:ring-primary/50 data-[size=default]:h-9">
                <SelectValue>
                  {(v) => v ?? "Select a model…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((id) => {
                  const free =
                    provider === "zen" &&
                    (isFreeModel(id) || fetchedFree.has(id));
                  const price = free
                    ? "Free"
                    : provider === "zen"
                      ? formatModelPrice(id, fetchedPrices)
                      : null;
                  return (
                    <SelectItem key={id} value={id}>
                      <span className="flex items-center justify-between gap-3 flex-1">
                        <span className="truncate">{id}</span>
                        {price && (
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={
                                free
                                  ? "text-xs text-green-400 font-medium"
                                  : "text-xs text-text-muted"
                              }
                            >
                              {price}
                            </span>
                            {free && (
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
                {models.length} models available at this endpoint.
                {provider === "zen" && (
                  <>
                    {" "}
                    Prices per 1M tokens are imported automatically from{" "}
                    <a
                      href="https://opencode.ai/docs/zen"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:text-primary/80"
                    >
                      opencode.ai/docs/zen
                    </a>{" "}
                    every time you reload models — may change.
                  </>
                )}
              </p>
            )}
            {provider === "zen" && pricingStatus && (
              <p
                className={
                  pricingStatus.startsWith("Prices imported") ||
                  pricingStatus.startsWith("Using")
                    ? "text-xs text-text-muted"
                    : "text-xs text-destructive"
                }
              >
                {pricingStatus}
              </p>
            )}
          </div>

          {/* Reasoning Effort */}
          {provider !== "anthropic" ? (
            <div className="space-y-1.5">
              <Label className="text-text-secondary text-xs">
                Reasoning Effort
              </Label>
              <Select
                value={reasoningEffort}
                onValueChange={(v) => setReasoningEffort(v ?? "")}
              >
                <SelectTrigger className="w-full bg-field border-border focus-visible:ring-primary/50 data-[size=default]:h-9">
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
          ) : (
            <div className="space-y-1.5">
              <Label className="text-text-secondary text-xs">
                Reasoning Effort
              </Label>
              <p className="text-xs text-text-muted">
                Not configurable for Anthropic yet — Claude models handle
                reasoning on their own.
              </p>
            </div>
          )}

          {/* Chat Agent Prompt */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">
              Chat Agent Prompt
            </Label>
            <Select
              value={promptMode}
              onValueChange={(v) => setPromptMode((v ?? "standard") as "standard" | "custom")}
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
              The standard prompt is the built-in instructions for the chat
              agent (shown below, read-only). Your profile and application
              context are always appended automatically, so the agent keeps
              knowing who you are and what you're applying for. A custom prompt
              replaces the built-in instructions only.
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

            <Label className="text-text-secondary text-xs">
              Custom prompt
            </Label>
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
            disabled={!canSave}
          >
            Save &amp; Connect
          </Button>
        </CardContent>
      </Card>

      {/* Paid model confirmation */}
      <Dialog open={confirmPaidOpen} onOpenChange={setConfirmPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This model costs money</DialogTitle>
            <DialogDescription>
              {pendingSelection && (
                <>
                  <span className="text-text-primary font-medium">
                    {pendingSelection}
                  </span>{" "}
                  is not a free model
                  {provider === "zen" && (
                    <>
                      {" "}
                      (
                      {formatModelPrice(pendingSelection, fetchedPrices) ??
                        "price not listed"}
                      )
                    </>
                  )}
                  . Using it will be billed to your account. Are you sure you
                  want to use it?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={declinePaidSelection}>
              No, I want a free model
            </Button>
            <Button variant="default" onClick={confirmPaidSelection}>
              Yes, I am sure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
