import type { ApiConfig } from "@/stores/chatStore";
import {
  inferProviderFromBaseUrl,
  isKnownProviderId,
} from "@/utils/providers";
import {
  DEFAULT_CONTEXT_WINDOW,
  MIN_CONTEXT_WINDOW,
} from "@/utils/tokens";
import type {
  ApplicationPriority,
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
  StatusHistoryEntry,
  WorkExperience,
  WorkMode,
} from "@/types";
import {
  normalizeProfileSectionOrder,
  type ProfileSectionId,
} from "@/utils/profileSections";

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

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    typeof value === "string" &&
    (APPLICATION_STATUSES as string[]).includes(value)
  );
}

const APPLICATION_PRIORITIES: ApplicationPriority[] = ["low", "medium", "high"];

function normalizePriority(value: unknown): ApplicationPriority {
  return typeof value === "string" &&
    (APPLICATION_PRIORITIES as string[]).includes(value)
    ? (value as ApplicationPriority)
    : "medium";
}

const WORK_MODES: WorkMode[] = ["onsite", "hybrid", "remote"];

function normalizeWorkMode(value: unknown): WorkMode {
  return typeof value === "string" && (WORK_MODES as string[]).includes(value)
    ? (value as WorkMode)
    : "";
}

/** Trimmed, de-duplicated tags with empty values removed. */
function normalizeTags(value: unknown): string[] {
  const tags = asStringArray(value)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => tag.slice(0, 40));
  return [...new Set(tags)].slice(0, 20);
}

/** Accept only real `YYYY-MM-DD` dates; anything else becomes "not set". */
function normalizeDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return "";
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) {
    return "";
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Repair the audit trail: drop malformed entries, always seed at least the
 * creation status, and append the current status when an old file (or an
 * older version of the app) changed it without recording history.
 */
function normalizeStatusHistory(
  value: unknown,
  status: ApplicationStatus,
  createdAt: string,
  updatedAt: string,
): StatusHistoryEntry[] {
  const entries: StatusHistoryEntry[] = [];
  for (const item of asArray(value)) {
    if (!isRecord(item) || !isApplicationStatus(item.status)) continue;
    const at = asString(item.at);
    if (!at || Number.isNaN(new Date(at).getTime())) continue;
    entries.push({ status: item.status, at });
  }
  if (entries.length === 0) {
    entries.push({ status, at: createdAt || updatedAt });
  } else if (entries[entries.length - 1].status !== status) {
    entries.push({
      status,
      at: updatedAt || entries[entries.length - 1].at,
    });
  }
  return entries.slice(-100);
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
    applicationId: asOptionalString(value.applicationId),
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
  const status = normalizeStatus(value.status);
  const createdAt = asString(value.createdAt, now);
  const updatedAt = asString(value.updatedAt, now);
  return {
    id: normalizeId(value.id),
    companyName: asString(value.companyName),
    jobTitle: asString(value.jobTitle),
    applicationUrl: asString(value.applicationUrl),
    status,
    jobDescription: asString(value.jobDescription),
    applicationLanguage: asString(value.applicationLanguage),
    requirements: asString(value.requirements),
    companyResearch: asString(value.companyResearch),
    notes: asString(value.notes),
    location: asString(value.location),
    workMode: normalizeWorkMode(value.workMode),
    salary: asString(value.salary),
    source: asString(value.source),
    priority: normalizePriority(value.priority),
    tags: normalizeTags(value.tags),
    appliedAt: normalizeDate(value.appliedAt),
    deadline: normalizeDate(value.deadline),
    followUpAt: normalizeDate(value.followUpAt),
    contactName: asString(value.contactName),
    contactEmail: asString(value.contactEmail),
    statusHistory: normalizeStatusHistory(
      value.statusHistory,
      status,
      createdAt,
      updatedAt,
    ),
    createdAt,
    updatedAt,
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

export function normalizeSettingsData(value: unknown): {
  theme: "dark" | "light" | "system";
  accent: string;
  lastTab: "overview" | "application" | "chat" | "profile";
  onboardingDone: boolean;
  profileSectionOrder: ProfileSectionId[];
} | null {
  if (!isRecord(value)) return null;
  const theme =
    value.theme === "light" || value.theme === "system" ? value.theme : "dark";
  const accent =
    typeof value.accent === "string" && /^#[0-9a-f]{6}$/i.test(value.accent)
      ? value.accent
      : "";
  const lastTab =
    value.lastTab === "overview" ||
    value.lastTab === "chat" ||
    value.lastTab === "profile"
      ? value.lastTab
      : "application";
  return {
    theme,
    accent,
    lastTab,
    onboardingDone: value.onboardingDone === true,
    profileSectionOrder: normalizeProfileSectionOrder(
      value.profileSectionOrder,
    ),
  };
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
    contextWindow:
      typeof value.contextWindow === "number" &&
      Number.isFinite(value.contextWindow) &&
      value.contextWindow >= MIN_CONTEXT_WINDOW
        ? Math.floor(value.contextWindow)
        : DEFAULT_CONTEXT_WINDOW,
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
