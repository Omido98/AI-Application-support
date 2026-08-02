// ──────────────────────────────────────────────
// LLM provider registry
// ──────────────────────────────────────────────

export type ProviderId = "zen" | "anthropic" | "openai" | "custom";

export interface ProviderDef {
  id: ProviderId;
  label: string;
  /** Key prefixes that reliably identify this provider's API keys. */
  keyPrefixes: string[];
  /** Default base URL; endpoint paths are appended by the backend. */
  defaultBaseUrl: string;
  /** Default model preselected when switching to this provider. */
  defaultModel: string;
  /** How the backend authenticates requests to this provider. */
  auth: "bearer" | "x-api-key";
  /** Whether the OpenCode Zen pricing import applies (Zen only). */
  hasZenPricing?: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "zen",
    label: "OpenCode Zen",
    keyPrefixes: [],
    defaultBaseUrl: "https://opencode.ai/zen/v1",
    defaultModel: "deepseek-v4-flash-free",
    auth: "bearer",
    hasZenPricing: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keyPrefixes: ["sk-ant-"],
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    auth: "x-api-key",
  },
  {
    id: "openai",
    label: "OpenAI",
    // Generic `sk-` keys are ambiguous (OpenCode Zen keys can look the same),
    // so OpenAI is never auto-detected from a pasted key.
    keyPrefixes: [],
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "",
    auth: "bearer",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    keyPrefixes: [],
    defaultBaseUrl: "",
    defaultModel: "",
    auth: "bearer",
  },
];

export function getProvider(id: ProviderId | null | undefined): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

/**
 * Detect the provider from an API key prefix. Returns `null` when the key
 * does not match any known provider (e.g. OpenCode Zen keys).
 */
export function detectProviderFromKey(key: string): ProviderId | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  for (const provider of PROVIDERS) {
    for (const prefix of provider.keyPrefixes) {
      if (trimmed.startsWith(prefix)) {
        return provider.id;
      }
    }
  }
  return null;
}

/** Infer the provider from a stored base URL (used by the config migration). */
export function inferProviderFromBaseUrl(baseUrl?: string): ProviderId {
  const url = baseUrl ?? "";
  if (url.includes("opencode.ai/zen")) return "zen";
  if (url.includes("api.anthropic.com")) return "anthropic";
  if (url.includes("api.openai.com")) return "openai";
  return "custom";
}

export function isKnownProviderId(id: unknown): id is ProviderId {
  return typeof id === "string" && PROVIDERS.some((p) => p.id === id);
}
