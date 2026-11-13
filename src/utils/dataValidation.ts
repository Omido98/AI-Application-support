import type { ApiConfig } from "@/stores/chatStore";
import {
  inferProviderFromBaseUrl,
  isKnownProviderId,
} from "@/utils/providers";
import type {
  ApplicationStatus,
  Certification,
  CoverLetter,
  Education,
  FluencyLevel,
  Interest,
  JobApplication,
  Language,
  OtherEngagement,
  ProfileData,
  Project,
  Skill,
  WorkExperience,
} from "@/types";

/**
 * Defensive normalization for data read from disk or imported from a backup.
 *
 * The JSON files are user-visible and user-editable, and a backup can be
 * malformed. Every field that reaches React is therefore coerced to the type
 * the UI expects; missing ids are generated, unknown enum values fall back to
 * a safe default, and non-object entries are dropped. A file with an
 * impossible top-level shape returns null so the caller can report it instead
 * of dereferencing it.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function newId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeId(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : newId();
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

function mapDefined<T>(
  value: unknown,
  normalize: (item: unknown) => T | null,
): T[] {
  return asArray(value).map(normalize).filter(notNull);
}

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "wishlist",
  "applied",
  "interview",
  "offer",
  "rejected",
];

function normalizeStatus(value: unknown): ApplicationStatus {
  return typeof value === "string" &&
    (APPLICATION_STATUSES as string[]).includes(value)
    ? (value as ApplicationStatus)
    : "wishlist";
}

const FLUENCY_LEVELS: FluencyLevel[] = [
  "Beginner",
  "Elementary",
  "Intermediate",
  "Upper Intermediate",
  "Advanced",
  "Fluent",
  "Native",
];

function normalizeFluency(value: unknown): FluencyLevel {
  return typeof value === "string" &&
    (FLUENCY_LEVELS as string[]).includes(value)
    ? (value as FluencyLevel)
    : "Intermediate";
}

function normalizeProject(value: unknown): Project | null {
  // Legacy profiles stored projects as plain strings.
  if (typeof value === "string") {
    return {
      id: newId(),
      name: value,
      startMonth: "",
      startYear: "",
      isCurrent: false,
    };
  }
  if (!isRecord(value)) return null;
  return {
    id: normalizeId(value.id),
    name: asString(value.name),
    startMonth: asString(value.startMonth),
    startYear: asString(value.startYear),
    isCurrent: asBoolean(value.isCurrent),
    endMonth: asOptionalString(value.endMonth),
    endYear: asOptionalString(value.endYear),
  };
}

function normalizeWorkExperience(value: unknown): WorkExperience | null {
  if (!isRecord(value)) return null;
  return {
    id: normalizeId(value.id),
    company: asString(value.company),
    role: asString(value.role),
    startMonth: asString(value.startMonth),
    startYear: asString(value.startYear),
    isCurrent: asBoolean(value.isCurrent),
    endMonth: asOptionalString(value.endMonth),
    endYear: asOptionalString(value.endYear),
    jobDescription: asString(value.jobDescription),
    projects: mapDefined(value.projects, normalizeProject),
  };
}

function normalizeEducation(value: unknown): Education | null {
  if (!isRecord(value)) return null;
  return {
    id: normalizeId(value.id),
    school: asString(value.school),
    degree: asString(value.degree),
    programName: asString(value.programName),
    major: asString(value.major),
    startMonth: asString(value.startMonth),
    startYear: asString(value.startYear),
    endMonth: asString(value.endMonth),
    endYear: asString(value.endYear),
    finalGrade: asString(value.finalGrade),
    courses: asStringArray(value.courses),
    thesisTitle: asString(value.thesisTitle),
  };
}

function normalizeCoverLetter(value: unknown): CoverLetter | null {
  if (!isRecord(value)) return null;
  return {
    id: normalizeId(value.id),
    company: asOptionalString(value.company),
    content: asString(value.content),
    addedAt: asString(value.addedAt, new Date().toISOString()),
  };
}

function normalizeOtherEngagement(value: unknown): OtherEngagement | null {
  if (!isRecord(value)) return null;
  return {
    id: normalizeId(value.id),
    organization: asString(value.organization),
    role: asString(value.role),
    startMonth: asString(value.startMonth),
    startYear: asString(value.startYear),
    isCurrent: asBoolean(value.isCurrent),
    endMonth: asOptionalString(value.endMonth),
    endYear: asOptionalString(value.endYear),
    description: asString(value.description),
    achievements: asStringArray(value.achievements),
  };
}

function normalizeCertification(value: unknown): Certification | null {
  if (!isRecord(value)) return null;
  return {
    id: normalizeId(value.id),
    name: asString(value.name),
    expiryMonth: asString(value.expiryMonth),
    expiryYear: asString(value.expiryYear),
  };
}

function normalizeSkill(value: unknown): Skill | null {
  if (!isRecord(value)) return null;
  return { id: normalizeId(value.id), name: asString(value.name) };
}

function normalizeInterest(value: unknown): Interest | null {
  if (!isRecord(value)) return null;
  return { id: normalizeId(value.id), name: asString(value.name) };
}

function normalizeLanguage(value: unknown): Language | null {
  if (!isRecord(value)) return null;
  return {
    id: normalizeId(value.id),
    name: asString(value.name),
    fluency: normalizeFluency(value.fluency),
  };
}

function normalizeApplication(value: unknown): JobApplication | null {
  if (!isRecord(value)) return null;
  const now = new Date().toISOString();
  return {
    id: normalizeId(value.id),
    companyName: asString(value.companyName),
    jobTitle: asString(value.jobTitle),
    applicationUrl: asString(value.applicationUrl),
    status: normalizeStatus(value.status),
    jobDescription: asString(value.jobDescription),
    applicationLanguage: asString(value.applicationLanguage),
    requirements: asString(value.requirements),
    companyResearch: asString(value.companyResearch),
    notes: asString(value.notes),
    createdAt: asString(value.createdAt, now),
    updatedAt: asString(value.updatedAt, now),
  };
}

export interface NormalizedApplicationsPayload {
  applications: JobApplication[];
  selectedApplicationId: string | null;
}

export function normalizeApplicationsPayload(
  value: unknown,
): NormalizedApplicationsPayload | null {
  if (!isRecord(value)) return null;
  if (value.applications !== undefined && !Array.isArray(value.applications)) {
    return null;
  }

  const applications: JobApplication[] = [];
  const seenIds = new Set<string>();
  for (const entry of asArray(value.applications)) {
    const application = normalizeApplication(entry);
    if (!application) continue;
    if (seenIds.has(application.id)) {
      application.id = newId();
    }
    seenIds.add(application.id);
    applications.push(application);
  }

  let selectedApplicationId =
    typeof value.selectedApplicationId === "string"
      ? value.selectedApplicationId
      : null;
  if (
    !selectedApplicationId ||
    !applications.some((app) => app.id === selectedApplicationId)
  ) {
    selectedApplicationId = applications[0]?.id ?? null;
  }

  return { applications, selectedApplicationId };
}

export function normalizeProfileData(value: unknown): ProfileData | null {
  if (!isRecord(value)) return null;
  return {
    fullName: asString(value.fullName),
    email: asString(value.email),
    city: asString(value.city),
    country: asString(value.country),
    linkedinUrl: asString(value.linkedinUrl),
    coverLetterSummary: asString(value.coverLetterSummary),
    interests: mapDefined(value.interests, normalizeInterest),
    education: mapDefined(value.education, normalizeEducation),
    coverLetters: mapDefined(value.coverLetters, normalizeCoverLetter),
    workExperience: mapDefined(value.workExperience, normalizeWorkExperience),
    otherEngagements: mapDefined(
      value.otherEngagements,
      normalizeOtherEngagement,
    ),
    certifications: mapDefined(value.certifications, normalizeCertification),
    skills: mapDefined(value.skills, normalizeSkill),
    languages: mapDefined(value.languages, normalizeLanguage),
  };
}

export function normalizeSettingsData(
  value: unknown,
): { theme: "dark" | "light"; accent: string } | null {
  if (!isRecord(value)) return null;
  const theme = value.theme === "light" ? "light" : "dark";
  const accent =
    typeof value.accent === "string" && /^#[0-9a-f]{6}$/i.test(value.accent)
      ? value.accent
      : "";
  return { theme, accent };
}

/**
 * Unsent drafts are keyed by application/thread id. Empty drafts are dropped
 * (they need no disk space) and prototype-mutating keys are rejected.
 */
export function normalizeDraftsData(
  value: unknown,
): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const drafts: Record<string, string> = {};
  for (const [threadId, draft] of Object.entries(value)) {
    if (threadId.length === 0 || typeof draft !== "string") continue;
    if (
      threadId === "__proto__" ||
      threadId === "constructor" ||
      threadId === "prototype"
    ) {
      continue;
    }
    if (draft.length > 0) drafts[threadId] = draft;
  }
  return drafts;
}

export function normalizeApiConfigData(value: unknown): ApiConfig | null {
  if (!isRecord(value)) return null;
  const baseUrl = asString(value.baseUrl);
  return {
    provider: isKnownProviderId(value.provider)
      ? value.provider
      : baseUrl
        ? inferProviderFromBaseUrl(baseUrl)
        : "zen",
    baseUrl,
    apiKey: asString(value.apiKey),
    model: asString(value.model),
    reasoningEffort:
      typeof value.reasoningEffort === "string" && value.reasoningEffort
        ? value.reasoningEffort
        : null,
    webSearchEnabled: asBoolean(value.webSearchEnabled),
    systemPromptMode: value.systemPromptMode === "custom" ? "custom" : "standard",
    customSystemPrompt: asString(value.customSystemPrompt),
    keychainAccount:
      typeof value.keychainAccount === "string"
        ? value.keychainAccount
        : null,
    sessionKeyOnly: asBoolean(value.sessionKeyOnly),
  };
}
