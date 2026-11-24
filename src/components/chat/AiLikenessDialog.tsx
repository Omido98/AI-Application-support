import { useCallback, useEffect, useRef, useState } from "react";
import { Gauge, Loader2, RotateCcw } from "lucide-react";
import type { AiLikenessBand, AiLikenessReview } from "@/utils/aiLikeness";
import type { ApiConfig } from "@/stores/chatStore";
import type { TokenUsage } from "@/types";
import { evaluateAiLikeness } from "@/utils/api";
import { getProvider } from "@/utils/providers";
import { formatTokenCount } from "@/utils/tokens";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Phase = "intro" | "pending" | "result" | "raw" | "error";

const BAND_LABELS: Record<AiLikenessBand, string> = {
  "human-leaning": "Reads human",
  mixed: "Mixed signals",
  "ai-leaning": "Reads AI-like",
};

function bandClasses(band: AiLikenessBand): string {
  if (band === "human-leaning") {
    return "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300";
  }
  if (band === "ai-leaning") {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

function barClasses(band: AiLikenessBand): string {
  if (band === "human-leaning") return "bg-green-500";
  if (band === "ai-leaning") return "bg-red-500";
  return "bg-amber-500";
}

function BandBadge({ band }: { band: AiLikenessBand }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        bandClasses(band),
      )}
    >
      {BAND_LABELS[band]}
    </span>
  );
}

function usageLine(usage: TokenUsage): string {
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) {
    parts.push(`${formatTokenCount(usage.inputTokens)} in`);
  }
  if (usage.outputTokens !== undefined) {
    parts.push(`${formatTokenCount(usage.outputTokens)} out`);
  }
  return parts.join(" / ");
}

interface AiLikenessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  config: ApiConfig;
  chatBusy?: boolean;
}

/**
 * A transient, in-app modal for one AI-likeness review. It deliberately does
 * not append anything to the chat: the request is stateless, the answer lives
 * only in this component's state, and closing the dialog aborts any in-flight
 * request and discards the result.
 */
export default function AiLikenessDialog({
  open,
  onOpenChange,
  text,
  config,
  chatBusy = false,
}: AiLikenessDialogProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [review, setReview] = useState<AiLikenessReview | null>(null);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<TokenUsage | undefined>(undefined);
  const [finishReason, setFinishReason] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // State updates are asynchronous, so a rapid double-click could otherwise
  // pass the `phase !== "pending"` check twice and spend two requests.
  const inFlightRef = useRef(false);

  const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
  const hasCredentials = Boolean(config.apiKey.trim() && config.baseUrl.trim());
  const canRun = hasCredentials && !chatBusy && phase !== "pending";
  const providerLabel = getProvider(config.provider).label;
  const modelLabel = config.model.trim() || "the configured model";

  const reset = useCallback(() => {
    inFlightRef.current = false;
    setPhase("intro");
    setReview(null);
    setRaw("");
    setError(null);
    setUsage(undefined);
    setFinishReason(null);
  }, []);

  // Opening starts a fresh view; changing the draft while open also clears
  // the previous result. No request is fired here: the user must press Run.
  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    reset();
  }, [open, text, reset]);

  // Never leave an orphaned request running after the chat tab unmounts.
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const runCheck = async () => {
    if (!canRun || inFlightRef.current) return;
    inFlightRef.current = true;

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;

    setPhase("pending");
    setReview(null);
    setRaw("");
    setError(null);
    setUsage(undefined);
    setFinishReason(null);

    try {
      const result = await evaluateAiLikeness(text, config, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setUsage(result.usage);
      setFinishReason(result.finishReason ?? null);

      if (result.error) {
        setError(result.error);
        setPhase("error");
        return;
      }
      if (result.stopped) {
        setPhase("intro");
        return;
      }
      if (result.review) {
        setReview(result.review);
        setPhase("result");
        return;
      }

      setRaw(result.raw || "The model returned an empty response.");
      setPhase("raw");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    } finally {
      inFlightRef.current = false;
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="size-4 text-primary" aria-hidden="true" />
            AI-likeness check
          </DialogTitle>
          <DialogDescription>
            One model's impression of how AI-like this draft reads. Not proof of
            authorship.
          </DialogDescription>
        </DialogHeader>

        <p className="truncate rounded border border-border bg-field px-3 py-2 font-mono text-[11px] text-text-muted">
          {preview || "No draft text."}
        </p>

        {phase === "intro" && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              This sends the draft to your configured {providerLabel} model (
              {modelLabel}) and uses tokens. No separate detector service is
              involved.
            </p>
            {!hasCredentials && (
              <p className="text-xs text-destructive">
                Add an API key and base URL in Settings to run this check.
              </p>
            )}
            {chatBusy && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Wait for the current reply to finish before checking.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => void runCheck()}
                disabled={!canRun}
              >
                <Gauge className="mr-1 size-3.5" />
                Run check
              </Button>
            </div>
          </div>
        )}

        {phase === "pending" && (
          <div className="space-y-3" role="status">
            <div className="flex items-center gap-3 rounded border border-border bg-field px-3 py-4">
              <Loader2
                className="size-4 animate-spin text-primary"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm text-text-primary">Reading the draft…</p>
                <p className="text-[11px] text-text-muted">
                  You can close this window to cancel.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase === "result" && review && (
          <div className="space-y-4" aria-live="polite">
            <div className="rounded-lg border border-border bg-field p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-text-primary">
                    {review.likelihood}
                  </span>
                  <span className="text-xs text-text-muted">
                    / 100 model estimate
                  </span>
                </div>
                <BandBadge band={review.band} />
              </div>
              <div className="mt-3 h-2 rounded-full bg-border">
                <div
                  className={cn("h-2 rounded-full", barClasses(review.band))}
                  style={{ width: `${review.likelihood}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                Confidence: {review.confidence}
              </p>
            </div>

            {review.reasons.length > 0 ? (
              <div>
                <h4 className="text-xs font-medium text-text-secondary">Why</h4>
                <ul className="mt-2 space-y-2">
                  {review.reasons.map((reason, index) => (
                    <li
                      key={`${reason.signal}-${index}`}
                      className="rounded border border-border bg-field px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-text-primary">
                          {reason.signal}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wide",
                            reason.direction === "human"
                              ? "text-green-700 dark:text-green-300"
                              : "text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {reason.direction === "human"
                            ? "human signal"
                            : "AI signal"}
                        </span>
                      </div>
                      {reason.evidence && (
                        <p className="mt-1 text-xs text-text-secondary">
                          “{reason.evidence}”
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                The model returned a score without specific reasons.
              </p>
            )}

            {review.caveats.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-text-secondary">
                  Caveats
                </h4>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-text-muted">
                  {review.caveats.map((caveat, index) => (
                    <li key={index}>{caveat}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              This model may have written the draft, so it can be lenient. Treat
              this as a second opinion, not ground truth.
            </p>

            {usage && usageLine(usage) && (
              <p className="font-mono text-[10px] text-text-muted">
                Tokens: {usageLine(usage)}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runCheck()}
                disabled={!canRun}
              >
                <RotateCcw className="mr-1 size-3.5" />
                Re-run
              </Button>
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}

        {phase === "raw" && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              The model did not return a structured result.
              {finishReason === "length"
                ? " Its response was cut off before the JSON was complete."
                : ""}
            </p>
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border bg-field p-3 text-xs text-text-secondary">
              {raw}
            </pre>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runCheck()}
                disabled={!canRun}
              >
                <RotateCcw className="mr-1 size-3.5" />
                Try again
              </Button>
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <p
              role="alert"
              className="rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error ?? "The check failed."}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runCheck()}
                disabled={!canRun}
              >
                <RotateCcw className="mr-1 size-3.5" />
                Try again
              </Button>
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
