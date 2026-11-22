import type { JobApplication, ProfileData } from "@/types";
import {
  CV_SECTIONS,
  type CvAiUsage,
  type CvCertification,
  type CvContact,
  type CvDocument,
  type CvEducation,
  type CvExperience,
  type CvExperienceRole,
  type CvLanguage,
  type CvLanguageSkill,
  type CvOtherEngagement,
  type CvPageSize,
  type CvProject,
  type CvSectionId,
  type CvTemplate,
} from "@/types/cv";
import { newMessageId } from "@/utils/ids";
import {
  groupWorkExperience,
  mergeAdjacentExperienceGroups,
} from "@/utils/cvExperience";

const MONTHS: Record<CvLanguage, string[]> = {
  en: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  sv: [
    "jan",
    "feb",
    "mar",
    "apr",
    "maj",
    "jun",
    "jul",
    "aug",
    "sep",
    "okt",
    "nov",
    "dec",
  ],
};

const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const CV_PRESENT_LABEL: Record<CvLanguage, string> = {
  en: "Present",
  sv: "Nuvarande",
};

/** Hash of the profile snapshot used to detect stale CV drafts. */
export function profileFingerprint(profile: ProfileData): string {
  const source = JSON.stringify(profile);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function formatCvDate(
  month: string,
  year: string,
  language: CvLanguage,
): string {
  const index = ENGLISH_MONTHS.findIndex(
    (value) => value.toLowerCase() === month.trim().toLowerCase(),
  );
  const monthLabel = index >= 0 ? MONTHS[language][index] : month.trim();
  return [monthLabel, year.trim()].filter(Boolean).join(" ");
}

export function cvDateRange(
  startMonth: string,
  startYear: string,
  endMonth: string | undefined,
  endYear: string | undefined,
  current: boolean,
  language: CvLanguage,
): string {
  const start = formatCvDate(startMonth, startYear, language);
  if (current) return `${start} – ${CV_PRESENT_LABEL[language]}`.trim();
  const end = formatCvDate(endMonth ?? "", endYear ?? "", language);
  if (!end) return start;
  return `${start} – ${end}`.trim();
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function cleanList(values: string[]): string[] {
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, 30);
}

function contactFromProfile(profile: ProfileData): CvContact {
  return {
    fullName: profile.fullName.trim(),
    email: profile.email.trim(),
    phone: (profile.phone ?? "").trim(),
    location: [profile.city.trim(), profile.country.trim()]
      .filter(Boolean)
      .join(", "),
    linkedinUrl: profile.linkedinUrl.trim(),
    portfolioUrl: (profile.portfolioUrl ?? "").trim(),
    githubUrl: (profile.githubUrl ?? "").trim(),
  };
}

/**
 * Build an editable CV from the profile without inventing any content.
 * Used by "Start from profile" and as a structural fallback.
 */
export function createCvDocumentFromProfile(
  profile: ProfileData,
  application: JobApplication,
  options: {
    language: CvLanguage;
    pageSize: CvPageSize;
    extraContext?: string;
    template?: CvTemplate;
    now?: Date;
  },
): CvDocument {
  const now = options.now ?? new Date();
  const language = options.language;

  const experience: CvExperience[] = groupWorkExperience(
    profile.workExperience,
  ).map((group) => {
    const roles: CvExperienceRole[] = group.map((work) => ({
      id: newMessageId(),
      sourceId: work.id,
      title: work.role.trim(),
      startDate: formatCvDate(work.startMonth, work.startYear, language),
      endDate: work.isCurrent
        ? CV_PRESENT_LABEL[language]
        : formatCvDate(work.endMonth ?? "", work.endYear ?? "", language),
      current: work.isCurrent,
    }));
    const bullets = cleanList(
      group.flatMap((work) => [
        ...(work.achievements ?? []),
        ...splitLines(work.jobDescription),
      ]),
    ).slice(0, 10);
    return {
      id: newMessageId(),
      sourceId: group[0]?.id,
      company: group[0]?.company.trim() || "",
      location: "",
      roles,
      bullets,
      included: true,
    };
  });

  const education: CvEducation[] = profile.education.map((entry) => ({
    id: newMessageId(),
    sourceId: entry.id,
    school: entry.school.trim(),
    degree: entry.degree.trim(),
    field: [entry.programName, entry.major].filter(Boolean).join(", "),
    startDate: formatCvDate(entry.startMonth, entry.startYear, language),
    endDate: formatCvDate(entry.endMonth, entry.endYear, language),
    details: cleanList([
      entry.thesisTitle ? `Thesis: ${entry.thesisTitle.trim()}` : "",
      entry.finalGrade ? `Grade: ${entry.finalGrade.trim()}` : "",
      ...entry.courses,
    ]),
    included: true,
  }));

  const projects: CvProject[] = profile.workExperience.flatMap((work) =>
    work.projects
      .filter((project) => project.name.trim() || project.achievements?.length)
      .map((project) => ({
        id: newMessageId(),
        sourceId: project.id,
        title: "",
        description: project.name.trim(),
        period: cvDateRange(
          project.startMonth,
          project.startYear,
          project.endMonth,
          project.endYear,
          project.isCurrent,
          language,
        ),
        bullets: cleanList(project.achievements ?? []),
        included: true,
      })),
  );

  const certifications: CvCertification[] = profile.certifications.map(
    (entry) => ({
      id: newMessageId(),
      sourceId: entry.id,
      name: entry.name.trim(),
      issuer: "",
      date: formatCvDate(entry.expiryMonth, entry.expiryYear, language),
      included: true,
    }),
  );

  const languages: CvLanguageSkill[] = profile.languages.map((entry) => ({
    id: newMessageId(),
    sourceId: entry.id,
    name: entry.name.trim(),
    level: entry.fluency,
    included: true,
  }));

  const otherEngagements: CvOtherEngagement[] = profile.otherEngagements.map(
    (entry) => ({
      id: newMessageId(),
      sourceId: entry.id,
      organization: entry.organization.trim(),
      role: entry.role.trim(),
      startDate: formatCvDate(entry.startMonth, entry.startYear, language),
      endDate: entry.isCurrent
        ? CV_PRESENT_LABEL[language]
        : formatCvDate(entry.endMonth ?? "", entry.endYear ?? "", language),
      current: entry.isCurrent,
      bullets: cleanList([
        ...entry.achievements,
        ...splitLines(entry.description),
      ]).slice(0, 8),
      included: true,
    }),
  );

  return {
    schemaVersion: 2,
    language,
    contentLanguage: language,
    pageSize: options.pageSize,
    template: options.template ?? "classic",
    generatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    profileFingerprint: profileFingerprint(profile),
    applicationUpdatedAt: application.updatedAt,
    extraContext: (options.extraContext ?? "").trim(),
    contact: contactFromProfile(profile),
    headline: "",
    summary: "",
    skills: cleanList(profile.skills.map((skill) => skill.name)),
    experience,
    education,
    projects,
    certifications,
    languages,
    otherEngagements,
    sectionOrder: [...CV_SECTIONS],
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringList(value: unknown, limit = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeSectionOrder(value: unknown): CvSectionId[] {
  const provided = Array.isArray(value)
    ? value.filter((item): item is CvSectionId =>
        CV_SECTIONS.includes(item as CvSectionId),
      )
    : [];
  return [...new Set([...provided, ...CV_SECTIONS])];
}

function normalizeAiSections(value: unknown): CvSectionId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)].filter((item): item is CvSectionId =>
    CV_SECTIONS.includes(item as CvSectionId),
  );
}

function normalizeContact(value: unknown): CvContact {
  const record = asObject(value) ?? {};
  return {
    fullName: asString(record.fullName),
    email: asString(record.email),
    phone: asString(record.phone),
    location: asString(record.location),
    linkedinUrl: asString(record.linkedinUrl),
    portfolioUrl: asString(record.portfolioUrl),
    githubUrl: asString(record.githubUrl),
  };
}

function normalizeExperienceRole(value: unknown): CvExperienceRole | null {
  const record = asObject(value);
  if (!record) return null;
  return {
    id: asString(record.id) || newMessageId(),
    sourceId: asString(record.sourceId) || undefined,
    title: asString(record.title) || asString(record.role),
    startDate: asString(record.startDate),
    endDate: asString(record.endDate),
    current: asBool(record.current, false),
  };
}

function normalizeExperience(value: unknown): CvExperience | null {
  const record = asObject(value);
  if (!record) return null;
  const roleRecords = Array.isArray(record.roles)
    ? record.roles
        .map(normalizeExperienceRole)
        .filter((item): item is CvExperienceRole => item !== null)
        .slice(0, 20)
    : [];
  const legacyRole = asString(record.role);
  const legacyStart = asString(record.startDate);
  const legacyEnd = asString(record.endDate);
  const legacyCurrent = asBool(record.current, false);
  const roles: CvExperienceRole[] =
    roleRecords.length > 0
      ? roleRecords
      : legacyRole || legacyStart || legacyEnd || legacyCurrent
        ? [
            {
              id: newMessageId(),
              sourceId: asString(record.sourceId) || undefined,
              title: legacyRole,
              startDate: legacyStart,
              endDate: legacyEnd,
              current: legacyCurrent,
            },
          ]
        : [];
  return {
    id: asString(record.id) || newMessageId(),
    sourceId: asString(record.sourceId) || roles[0]?.sourceId,
    company: asString(record.company),
    location: asString(record.location),
    roles,
    bullets: asStringList(record.bullets, 20),
    included: asBool(record.included, true),
  };
}

function normalizeEducation(value: unknown): CvEducation | null {
  const record = asObject(value);
  if (!record) return null;
  return {
    id: asString(record.id) || newMessageId(),
    sourceId: asString(record.sourceId) || undefined,
    school: asString(record.school),
    degree: asString(record.degree),
    field: asString(record.field),
    startDate: asString(record.startDate),
    endDate: asString(record.endDate),
    details: asStringList(record.details, 20),
    included: asBool(record.included, true),
  };
}

function normalizeProject(value: unknown): CvProject | null {
  const record = asObject(value);
  if (!record) return null;
  return {
    id: asString(record.id) || newMessageId(),
    sourceId: asString(record.sourceId) || undefined,
    title: asString(record.title),
    description: asString(record.description),
    period: asString(record.period),
    bullets: asStringList(record.bullets, 12),
    included: asBool(record.included, true),
  };
}

function normalizeCertification(value: unknown): CvCertification | null {
  const record = asObject(value);
  if (!record) return null;
  return {
    id: asString(record.id) || newMessageId(),
    sourceId: asString(record.sourceId) || undefined,
    name: asString(record.name),
    issuer: asString(record.issuer),
    date: asString(record.date),
    included: asBool(record.included, true),
  };
}

function normalizeLanguage(value: unknown): CvLanguageSkill | null {
  const record = asObject(value);
  if (!record) return null;
  return {
    id: asString(record.id) || newMessageId(),
    sourceId: asString(record.sourceId) || undefined,
    name: asString(record.name),
    level: asString(record.level),
    included: asBool(record.included, true),
  };
}

function normalizeOther(value: unknown): CvOtherEngagement | null {
  const record = asObject(value);
  if (!record) return null;
  return {
    id: asString(record.id) || newMessageId(),
    sourceId: asString(record.sourceId) || undefined,
    organization: asString(record.organization),
    role: asString(record.role),
    startDate: asString(record.startDate),
    endDate: asString(record.endDate),
    current: asBool(record.current, false),
    bullets: asStringList(record.bullets, 12),
    included: asBool(record.included, true),
  };
}

function normalizeArray<T>(
  value: unknown,
  normalize: (item: unknown) => T | null,
): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalize)
    .filter((item): item is T => item !== null)
    .slice(0, 40);
}

function normalizeUsage(value: unknown): CvAiUsage | undefined {
  const record = asObject(value);
  if (!record) return undefined;
  const kind = record.kind === "rewrite" ? "rewrite" : "generate";
  const inputTokens =
    typeof record.inputTokens === "number" &&
    Number.isFinite(record.inputTokens)
      ? Math.max(0, Math.round(record.inputTokens))
      : undefined;
  const outputTokens =
    typeof record.outputTokens === "number" &&
    Number.isFinite(record.outputTokens)
      ? Math.max(0, Math.round(record.outputTokens))
      : undefined;
  const costUsd =
    typeof record.costUsd === "number" && Number.isFinite(record.costUsd)
      ? Math.max(0, record.costUsd)
      : undefined;
  return {
    kind,
    at: asString(record.at, new Date().toISOString()),
    model: asString(record.model),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}

/** Defensive normalizer for CV files written by older/newer app versions. */
export function normalizeCvDocument(value: unknown): CvDocument | null {
  const record = asObject(value);
  if (!record || (record.schemaVersion !== 1 && record.schemaVersion !== 2)) {
    return null;
  }
  const version = record.schemaVersion;
  const language: CvLanguage = record.language === "sv" ? "sv" : "en";
  const pageSize: CvPageSize = record.pageSize === "letter" ? "letter" : "a4";
  const now = new Date().toISOString();
  const lastUsage = normalizeUsage(record.lastUsage);
  const contentLanguage =
    record.contentLanguage === "sv" || record.contentLanguage === "en"
      ? record.contentLanguage
      : undefined;
  const template: CvTemplate =
    record.template === "compact" ? "compact" : "classic";
  const normalizedExperience = normalizeArray(
    record.experience,
    normalizeExperience,
  );
  const experience =
    version === 1
      ? mergeAdjacentExperienceGroups(normalizedExperience)
      : normalizedExperience;
  return {
    schemaVersion: 2,
    language,
    ...(contentLanguage ? { contentLanguage } : {}),
    pageSize,
    template,
    generatedAt: asString(record.generatedAt, now),
    updatedAt: asString(record.updatedAt, now),
    profileFingerprint: asString(record.profileFingerprint),
    applicationUpdatedAt: asString(record.applicationUpdatedAt),
    extraContext: asString(record.extraContext),
    contact: normalizeContact(record.contact),
    headline: asString(record.headline),
    summary: asString(record.summary),
    skills: asStringList(record.skills),
    experience,
    education: normalizeArray(record.education, normalizeEducation),
    projects: normalizeArray(record.projects, normalizeProject),
    certifications: normalizeArray(
      record.certifications,
      normalizeCertification,
    ),
    languages: normalizeArray(record.languages, normalizeLanguage),
    otherEngagements: normalizeArray(record.otherEngagements, normalizeOther),
    sectionOrder: normalizeSectionOrder(record.sectionOrder),
    aiSections: normalizeAiSections(record.aiSections),
    ...(lastUsage ? { lastUsage } : {}),
  };
}

export function hasCvContent(document: CvDocument): boolean {
  return Boolean(
    document.headline.trim() ||
    document.summary.trim() ||
    document.skills.length ||
    document.experience.some(
      (item) =>
        item.included && (item.bullets.length > 0 || item.roles.length > 0),
    ) ||
    document.education.some((item) => item.included) ||
    document.projects.some((item) => item.included) ||
    document.certifications.some((item) => item.included) ||
    document.languages.some((item) => item.included) ||
    document.otherEngagements.some((item) => item.included),
  );
}
