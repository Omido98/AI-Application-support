import type { TokenUsage } from "@/types";
import type { CvAiUsage } from "@/types/cv";
import type { ApiConfig } from "@/stores/chatStore";
import { formatTokenCount } from "@/utils/tokens";
import {
  estimateUsageCost,
  formatUsageCost,
  isFreeModel,
} from "@/utils/zenPricing";

/** Sum provider-reported usage across a request and its retry, if any. */
export function makeCvUsage(
  kind: CvAiUsage["kind"],
  config: ApiConfig,
  usages: (TokenUsage | undefined)[],
): CvAiUsage | undefined {
  const inputTokens = usages.reduce(
    (sum, usage) => sum + (usage?.inputTokens ?? 0),
    0,
  );
  const outputTokens = usages.reduce(
    (sum, usage) => sum + (usage?.outputTokens ?? 0),
    0,
  );
  const hasTokens = usages.some(
    (usage) =>
      usage?.inputTokens !== undefined || usage?.outputTokens !== undefined,
  );
  if (!hasTokens) return undefined;

  let costUsd: number | undefined;
  if (config.provider === "zen") {
    costUsd = isFreeModel(config.model)
      ? 0
      : (estimateUsageCost(config.model, { inputTokens, outputTokens }) ??
        undefined);
  }

  return {
    kind,
    at: new Date().toISOString(),
    model: config.model,
    ...(inputTokens > 0 ? { inputTokens } : {}),
    ...(outputTokens > 0 ? { outputTokens } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}

/** Compact, human-readable token/cost label. */
export function formatCvUsage(usage: CvAiUsage): string {
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) {
    parts.push(`${formatTokenCount(usage.inputTokens)} in`);
  }
  if (usage.outputTokens !== undefined) {
    parts.push(`${formatTokenCount(usage.outputTokens)} out`);
  }
  if (usage.costUsd !== undefined) {
    parts.push(formatUsageCost(usage.costUsd));
  }
  return parts.join(" · ");
}
