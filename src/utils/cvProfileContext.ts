import type { ProfileData } from "@/types";
import { contentTokens } from "@/utils/textTokens";

interface CvProfileContext {
  numbers: Set<string>;
  /** Token set for the claim-overlap audit, computed once per profile object. */
  tokens: Set<string>;
}

const NUMBER_RE = /\b\d[\d,]*(?:\.\d+)?(?:%|k|m|bn)?/gi;
const cache = new WeakMap<ProfileData, CvProfileContext>();

function numericTokens(value: string): string[] {
  return (value.match(NUMBER_RE) ?? []).map((token) =>
    token.toLowerCase().replace(/,/g, ""),
  );
}

/**
 * Cache the expensive profile serialization/number extraction/tokenization.
 * Profile objects are replaced on each store update, so a WeakMap naturally
 * invalidates.
 */
export function getCvProfileContext(profile: ProfileData): CvProfileContext {
  const cached = cache.get(profile);
  if (cached) return cached;
  const json = JSON.stringify(profile);
  const context = {
    numbers: new Set(numericTokens(json)),
    tokens: new Set(contentTokens(json)),
  };
  cache.set(profile, context);
  return context;
}
