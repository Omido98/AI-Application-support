import type { CvDocument, CvRewriteTarget, CvSectionId } from "@/types/cv";

export function sectionForRewriteTarget(target: CvRewriteTarget): CvSectionId {
  if (target.kind === "project") return "projects";
  if (target.kind === "other") return "other";
  return target.kind;
}

/** Mark one section as AI-assisted without changing its content. */
export function markAiSection(
  document: CvDocument,
  section: CvSectionId,
): CvDocument {
  if (document.aiSections?.includes(section)) return document;
  return {
    ...document,
    aiSections: [...new Set([...(document.aiSections ?? []), section])],
  };
}

export function markAiSections(
  document: CvDocument,
  sections: CvSectionId[],
): CvDocument {
  return {
    ...document,
    aiSections: [...new Set([...(document.aiSections ?? []), ...sections])],
  };
}

/** A manual edit takes ownership of that section; remove its AI marker. */
export function clearAiSection(
  document: CvDocument,
  section: CvSectionId,
): CvDocument {
  if (!document.aiSections?.includes(section)) return document;
  return {
    ...document,
    aiSections: document.aiSections.filter((entry) => entry !== section),
  };
}
