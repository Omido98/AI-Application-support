import type { ProfileData } from "@/types";

export type ImportMode = "merge" | "replace";

function normalizedKey(...parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim().toLowerCase())
    .join("|");
}

function dedupe<T>(
  existing: T[],
  incoming: T[],
  keyOf: (item: T) => string,
): T[] {
  const seen = new Set(existing.map(keyOf));
  const added: T[] = [];
  for (const item of incoming) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    added.push(item);
  }
  return added;
}

/**
 * Combine a CV import with the current profile.
 *
 * "merge" only fills empty personal fields and appends entries that are not
 * already present. "replace" swaps all CV-related sections but keeps the
 * saved cover letters and their summary, which a CV cannot contain.
 */
export function applyImportedProfile(
  current: ProfileData,
  imported: ProfileData,
  mode: ImportMode,
): ProfileData {
  if (mode === "replace") {
    return {
      ...imported,
      coverLetterSummary: current.coverLetterSummary,
      coverLetters: current.coverLetters,
    };
  }

  const fill = (existing: string, incoming: string) =>
    existing.trim() ? existing : incoming;

  return {
    ...current,
    fullName: fill(current.fullName, imported.fullName),
    email: fill(current.email, imported.email),
    city: fill(current.city, imported.city),
    country: fill(current.country, imported.country),
    linkedinUrl: fill(current.linkedinUrl, imported.linkedinUrl),
    education: [
      ...current.education,
      ...dedupe(current.education, imported.education, (item) =>
        normalizedKey(item.school, item.degree, item.startYear),
      ),
    ],
    workExperience: [
      ...current.workExperience,
      ...dedupe(current.workExperience, imported.workExperience, (item) =>
        normalizedKey(item.company, item.role, item.startYear),
      ),
    ],
    otherEngagements: [
      ...current.otherEngagements,
      ...dedupe(current.otherEngagements, imported.otherEngagements, (item) =>
        normalizedKey(item.organization, item.role, item.startYear),
      ),
    ],
    certifications: [
      ...current.certifications,
      ...dedupe(current.certifications, imported.certifications, (item) =>
        normalizedKey(item.name, item.expiryYear),
      ),
    ],
    skills: [
      ...current.skills,
      ...dedupe(current.skills, imported.skills, (item) =>
        item.name.trim().toLowerCase(),
      ),
    ],
    languages: [
      ...current.languages,
      ...dedupe(current.languages, imported.languages, (item) =>
        item.name.trim().toLowerCase(),
      ),
    ],
    interests: [
      ...current.interests,
      ...dedupe(current.interests, imported.interests, (item) =>
        item.name.trim().toLowerCase(),
      ),
    ],
    coverLetterSummary: current.coverLetterSummary,
    coverLetters: current.coverLetters,
  };
}
