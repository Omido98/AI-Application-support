import type { WorkExperience } from "@/types";
import type { CvExperience, CvExperienceRole, CvLanguage } from "@/types/cv";
import { CV_UI_TEXT } from "@/utils/cvLanguage";

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  januari: 0,
  feb: 1,
  february: 1,
  februari: 1,
  mar: 2,
  march: 2,
  mars: 2,
  apr: 3,
  april: 3,
  may: 4,
  maj: 4,
  jun: 5,
  june: 5,
  juni: 5,
  jul: 6,
  july: 6,
  juli: 6,
  aug: 7,
  august: 7,
  augusti: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  oktober: 9,
  okt: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/**
 * Sortable month key for the date labels used by the profile and CV.
 * Returns null for open-ended labels such as "Present" or free text.
 */
export function parseCvDateKey(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const monthYear = /^([\p{L}]+)\s+(\d{4})$/u.exec(normalized);
  if (monthYear) {
    const month = MONTH_INDEX[monthYear[1]];
    if (month === undefined) return null;
    return Number(monthYear[2]) * 12 + month;
  }
  const yearOnly = /^(\d{4})$/.exec(normalized);
  if (yearOnly) return Number(yearOnly[1]) * 12;
  return null;
}

function profileStartKey(work: WorkExperience): number | null {
  return parseCvDateKey(`${work.startMonth} ${work.startYear}`);
}

/** Newest role first. Entries with unknown dates keep their relative order. */
export function sortCvRoles(roles: CvExperienceRole[]): CvExperienceRole[] {
  return [...roles].sort((a, b) => {
    const aStart = parseCvDateKey(a.startDate);
    const bStart = parseCvDateKey(b.startDate);
    if (aStart === null && bStart === null) return 0;
    if (aStart === null) return 1;
    if (bStart === null) return -1;
    if (aStart !== bStart) return bStart - aStart;
    const aEnd = parseCvDateKey(a.endDate);
    const bEnd = parseCvDateKey(b.endDate);
    if (aEnd === null && bEnd === null) return 0;
    if (aEnd === null) return 1;
    if (bEnd === null) return -1;
    return bEnd - aEnd;
  });
}

/** The employer range is derived from its roles, never stored twice. */
export function experienceRange(
  experience: CvExperience,
  language: CvLanguage,
): { start: string; end: string } {
  const roles = sortCvRoles(experience.roles);
  const starts = roles
    .filter((role) => parseCvDateKey(role.startDate) !== null)
    .sort(
      (a, b) =>
        (parseCvDateKey(a.startDate) ?? 0) - (parseCvDateKey(b.startDate) ?? 0),
    );
  const start =
    starts[0]?.startDate ??
    [...roles].reverse().find((role) => role.startDate.trim())?.startDate ??
    "";

  const current = roles.find((role) => role.current);
  if (current) {
    return {
      start,
      end: current.endDate.trim() || CV_UI_TEXT[language].present,
    };
  }

  const ends = roles
    .filter((role) => parseCvDateKey(role.endDate) !== null)
    .sort(
      (a, b) =>
        (parseCvDateKey(b.endDate) ?? 0) - (parseCvDateKey(a.endDate) ?? 0),
    );
  const end =
    ends[0]?.endDate ??
    roles.find((role) => role.endDate.trim())?.endDate ??
    "";
  return { start, end };
}

export function experienceRangeLabel(
  experience: CvExperience,
  language: CvLanguage,
): string {
  const { start, end } = experienceRange(experience, language);
  return [start, end].filter(Boolean).join(" – ");
}

export function roleDateRange(
  role: CvExperienceRole,
  language: CvLanguage = "en",
): string {
  const end =
    role.current && !role.endDate.trim()
      ? CV_UI_TEXT[language].present
      : role.endDate;
  return [role.startDate, end].filter(Boolean).join(" – ");
}

export function companyKey(company: string): string {
  return company
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "");
}

/**
 * Group consecutive roles at the same employer, newest employer first. A copy
 * is sorted, so the profile's own order is never mutated. Roles at the same
 * employer separated by another employer stay in separate groups, which
 * preserves a genuine break in the career history.
 */
export function groupWorkExperience(
  workExperience: WorkExperience[],
): WorkExperience[][] {
  const sorted = workExperience
    .map((work, index) => ({ work, index }))
    .sort((a, b) => {
      const aKey = profileStartKey(a.work);
      const bKey = profileStartKey(b.work);
      if (aKey === null && bKey === null) return a.index - b.index;
      if (aKey === null) return 1;
      if (bKey === null) return -1;
      return bKey - aKey;
    })
    .map(({ work }) => work);

  const groups: WorkExperience[][] = [];
  for (const work of sorted) {
    const key = companyKey(work.company);
    const previous = groups[groups.length - 1];
    if (previous && key && companyKey(previous[0].company) === key) {
      previous.push(work);
    } else {
      groups.push([work]);
    }
  }
  return groups;
}

/**
 * Migrate old flat CV entries: adjacent entries at the same employer become one
 * employer group. Only used while normalizing legacy documents.
 */
export function mergeAdjacentExperienceGroups(
  groups: CvExperience[],
): CvExperience[] {
  const merged: CvExperience[] = [];
  for (const group of groups) {
    const previous = merged[merged.length - 1];
    const previousKey = previous ? companyKey(previous.company) : "";
    const previousLocation = previous?.location.trim() ?? "";
    const groupLocation = group.location.trim();
    const locationsConflict = Boolean(
      previousLocation &&
      groupLocation &&
      previousLocation.toLocaleLowerCase() !==
        groupLocation.toLocaleLowerCase(),
    );
    if (
      previous &&
      previousKey &&
      previousKey === companyKey(group.company) &&
      previous.included === group.included &&
      !locationsConflict
    ) {
      const roles = sortCvRoles([...previous.roles, ...group.roles]);
      merged[merged.length - 1] = {
        ...previous,
        sourceId: roles[0]?.sourceId,
        location: previous.location || group.location,
        roles,
        bullets: [...new Set([...previous.bullets, ...group.bullets])].slice(
          0,
          20,
        ),
      };
    } else {
      merged.push(group);
    }
  }
  return merged;
}
