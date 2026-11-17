import type { ProfileData } from "@/types";

interface CvProfileContext {
  json: string;
  numbers: Set<string>;
}

const NUMBER_RE = /\b\d[\d,]*(?:\.\d+)?(?:%|k|m|bn)?/gi;
const cache = new WeakMap<ProfileData, CvProfileContext>();

function numericTokens(value: string): string[] {
  return (value.match(NUMBER_RE) ?? []).map((token) =>
    token.toLowerCase().replace(/,/g, ""),
  );
}

/**
 * Cache the expensive profile serialization/number extraction. Profile objects
 * are replaced on each store update, so a WeakMap naturally invalidates.
 */
export function getCvProfileContext(profile: ProfileData): CvProfileContext {
  const cached = cache.get(profile);
  if (cached) return cached;
  const json = JSON.stringify(profile);
  const context = {
    json,
    numbers: new Set(numericTokens(json)),
  };
  cache.set(profile, context);
  return context;
}
