export const PROFILE_SECTION_IDS = [
  "personal",
  "education",
  "work",
  "engagements",
  "certifications",
  "skills",
  "interests",
  "languages",
  "coverLetters",
] as const;

export type ProfileSectionId = (typeof PROFILE_SECTION_IDS)[number];

export const PROFILE_SECTION_LABELS: Record<ProfileSectionId, string> = {
  personal: "Personal details",
  education: "Education",
  work: "Work experience",
  engagements: "Other engagements",
  certifications: "Certifications",
  skills: "Skills",
  interests: "Interests",
  languages: "Languages",
  coverLetters: "Previous cover letters",
};

export const DEFAULT_PROFILE_SECTION_ORDER: ProfileSectionId[] = [
  ...PROFILE_SECTION_IDS,
];

function isProfileSectionId(value: unknown): value is ProfileSectionId {
  return (
    typeof value === "string" &&
    (PROFILE_SECTION_IDS as readonly string[]).includes(value)
  );
}

/**
 * Keep user order, drop unknown/duplicate ids, and append any section missing
 * from an older file so new sections can never disappear.
 */
export function normalizeProfileSectionOrder(
  value: unknown,
): ProfileSectionId[] {
  const seen = new Set<ProfileSectionId>();
  const order: ProfileSectionId[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isProfileSectionId(item) && !seen.has(item)) {
        seen.add(item);
        order.push(item);
      }
    }
  }
  for (const id of PROFILE_SECTION_IDS) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}
