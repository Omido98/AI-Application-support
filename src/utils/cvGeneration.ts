import type { JobApplication, ProfileData } from "@/types";
import type { TokenUsage } from "@/types";
import { CV_SECTIONS } from "@/types/cv";
import type { ChatMessage, ApiConfig } from "@/stores/chatStore";
import type {
  CvCertification,
  CvDocument,
  CvEducation,
  CvExperience,
  CvLanguage,
  CvLanguageSkill,
  CvOtherEngagement,
  CvPageSize,
  CvProject,
  CvTemplate,
} from "@/types/cv";
import { newMessageId } from "@/utils/ids";
import { sendMessage } from "@/utils/api";
import { buildCvGenerationPrompt } from "@/utils/cvPrompt";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { makeCvUsage } from "@/utils/cvUsage";
import { markAiSections } from "@/utils/cvProvenance";

interface GeneratedCvContent {
  headline?: unknown;
  summary?: unknown;
  skills?: unknown;
  experience?: unknown;
  education?: unknown;
  projects?: unknown;
  certifications?: unknown;
  languages?: unknown;
  otherEngagements?: unknown;
}

export interface CvGenerationOptions {
  language: CvLanguage;
  pageSize: CvPageSize;
  extraContext: string;
  template?: CvTemplate;
}

export class CvGenerationError extends Error {}

/** Cancellation is not a generation error: the caller keeps the old CV. */
function abortError(): Error {
  const error = new Error("CV generation cancelled.");
  error.name = "AbortError";
  return error;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Models occasionally add markdown even when asked for plain prose. */
function cleanProse(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-•*]\s+/gm, "")
    .trim();
}

function asStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanProse(item))
    .filter(Boolean)
    .slice(0, limit);
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

function sourceIdOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function plainSourceId(value: string, prefix: string): string {
  return value.startsWith(`${prefix}:`)
    ? value.slice(prefix.length + 1)
    : value;
}

/** Parse the model's JSON, tolerating code fences and a little prose. */
export function parseGeneratedCvJson(
  content: string,
): GeneratedCvContent | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as GeneratedCvContent)
      : null;
  } catch {
    return null;
  }
}

function baseSourceId(sourceId: string, prefix: string): string {
  return plainSourceId(sourceId, prefix);
}

/**
 * Merge model output into the profile-derived base. Identifying fields and the
 * complete experience timeline come from the profile; the model writes prose
 * and decides description depth.
 */
export function mergeGeneratedCv(
  content: GeneratedCvContent,
  base: CvDocument,
  options: CvGenerationOptions,
): CvDocument {
  const skills = asStringList(content.skills, 25);
  const headline = cleanProse(asString(content.headline));
  const summary = cleanProse(asString(content.summary));

  const generatedExperience = asRecords(content.experience);
  const groupBySource = new Map<string, CvExperience>();
  const groupByRoleSource = new Map<string, CvExperience>();
  for (const group of base.experience) {
    if (group.sourceId) groupBySource.set(group.sourceId, group);
    for (const role of group.roles) {
      if (role.sourceId) groupByRoleSource.set(role.sourceId, group);
    }
  }
  const generatedByGroup = new Map<string, Record<string, unknown>>();
  for (const item of generatedExperience) {
    const source = plainSourceId(sourceIdOf(item.sourceId), "work");
    const group = groupBySource.get(source) ?? groupByRoleSource.get(source);
    // One object per employer group is expected. The first one wins; unknown
    // IDs can never create an employer that is not in the profile.
    if (group && !generatedByGroup.has(group.id)) {
      generatedByGroup.set(group.id, item);
    }
  }
  // The experience section is a complete timeline. The model only supplies
  // description depth: every base employer group survives, in profile order.
  // A group the model leaves out is kept as titles and dates only; using the
  // profile-derived bullets for it would over-describe a role the model chose
  // not to discuss. A completely empty/unknown experience response is treated
  // as unusable and falls back to the profile-derived descriptions.
  const experience: CvExperience[] =
    Array.isArray(content.experience) && generatedByGroup.size > 0
      ? base.experience.map((group) => {
          const generated = generatedByGroup.get(group.id);
          if (!generated) return { ...group, bullets: [] };
          const bullets = Array.isArray(generated.bullets)
            ? asStringList(generated.bullets, 10)
            : group.bullets;
          return { ...group, bullets };
        })
      : base.experience;

  const educationById = new Map(
    base.education.map((item) => [item.sourceId ?? "", item]),
  );
  const generatedEducation = asRecords(content.education);
  const education: CvEducation[] = Array.isArray(content.education)
    ? generatedEducation.flatMap((item) => {
        const source = baseSourceId(sourceIdOf(item.sourceId), "education");
        const baseItem = educationById.get(source);
        if (!baseItem) return [];
        const details = asStringList(item.details, 20);
        return [
          {
            ...baseItem,
            details: details.length > 0 ? details : baseItem.details,
            included: true,
          },
        ];
      })
    : base.education;

  const projectById = new Map(
    base.projects.map((item) => [item.sourceId ?? "", item]),
  );
  const generatedProjects = asRecords(content.projects);
  const projects: CvProject[] = Array.isArray(content.projects)
    ? generatedProjects.flatMap((item) => {
        const source = baseSourceId(sourceIdOf(item.sourceId), "project");
        const baseItem = projectById.get(source);
        if (!baseItem) return [];
        const title = cleanProse(asString(item.title));
        const bullets = asStringList(item.bullets, 10);
        return [
          {
            ...baseItem,
            title: title || baseItem.title,
            description: baseItem.description,
            bullets: bullets.length > 0 ? bullets : baseItem.bullets,
            included: true,
          },
        ];
      })
    : base.projects;

  const certificationById = new Map(
    base.certifications.map((item) => [item.sourceId ?? "", item]),
  );
  const generatedCertifications = asRecords(content.certifications);
  const certifications: CvCertification[] = Array.isArray(
    content.certifications,
  )
    ? generatedCertifications.flatMap((item) => {
        const source = baseSourceId(sourceIdOf(item.sourceId), "certification");
        const baseItem = certificationById.get(source);
        return baseItem ? [{ ...baseItem, included: true }] : [];
      })
    : base.certifications;

  const languageById = new Map(
    base.languages.map((item) => [item.sourceId ?? "", item]),
  );
  const generatedLanguages = asRecords(content.languages);
  const languages: CvLanguageSkill[] = Array.isArray(content.languages)
    ? generatedLanguages.flatMap((item) => {
        const source = baseSourceId(sourceIdOf(item.sourceId), "language");
        const baseItem = languageById.get(source);
        return baseItem ? [{ ...baseItem, included: true }] : [];
      })
    : base.languages;

  const otherById = new Map(
    base.otherEngagements.map((item) => [item.sourceId ?? "", item]),
  );
  const generatedOther = asRecords(content.otherEngagements);
  const otherEngagements: CvOtherEngagement[] = Array.isArray(
    content.otherEngagements,
  )
    ? generatedOther.flatMap((item) => {
        const source = baseSourceId(sourceIdOf(item.sourceId), "other");
        const baseItem = otherById.get(source);
        if (!baseItem) return [];
        const bullets = asStringList(item.bullets, 10);
        return [
          {
            ...baseItem,
            bullets: bullets.length > 0 ? bullets : baseItem.bullets,
            included: true,
          },
        ];
      })
    : base.otherEngagements;

  return {
    ...base,
    language: options.language,
    pageSize: options.pageSize,
    extraContext: options.extraContext.trim(),
    headline: headline || base.headline,
    summary: summary || base.summary,
    skills: skills.length > 0 ? skills : base.skills,
    experience,
    education,
    projects,
    certifications,
    languages,
    otherEngagements,
    updatedAt: new Date().toISOString(),
  };
}

function userMessage(content: string): ChatMessage {
  return {
    id: newMessageId(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
}

export interface GenerateCvArgs {
  application: JobApplication;
  profile: ProfileData;
  config: ApiConfig;
  options: CvGenerationOptions;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}

/**
 * Generate a tailored CV with the configured provider. One repair attempt is
 * made when the model returns unusable JSON; the caller keeps the old CV on
 * failure.
 */
export async function generateCvDocument({
  application,
  profile,
  config,
  options,
  signal,
  onDelta,
}: GenerateCvArgs): Promise<CvDocument> {
  if (!config.apiKey.trim()) {
    throw new CvGenerationError(
      "Add an API key in Settings before generating a CV.",
    );
  }
  if (!application.jobDescription.trim()) {
    throw new CvGenerationError(
      "Add the job description to this application before generating a CV.",
    );
  }

  const systemPrompt = buildCvGenerationPrompt(application, profile, options);
  const base = createCvDocumentFromProfile(profile, application, options);
  const firstRequest = userMessage(
    "Create the tailored CV now. Return only the JSON object described in the system prompt.",
  );
  const messages: ChatMessage[] = [firstRequest];
  const usages: (TokenUsage | undefined)[] = [];

  let response = await sendMessage(
    messages,
    { ...config, webSearchEnabled: false },
    systemPrompt,
    { signal, onDelta },
  );
  // A stopped stream can still carry parseable partial JSON. Never treat it as
  // a complete CV, and never fire a repair request after the user cancelled.
  if (signal?.aborted || response.stopped) throw abortError();
  usages.push(response.usage);
  if (response.error) throw new CvGenerationError(response.error);

  let parsed = parseGeneratedCvJson(response.content);
  if (!parsed) {
    messages.push({
      id: newMessageId(),
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
    });
    messages.push(
      userMessage(
        "Your previous response was not valid JSON. Return the same CV as one valid JSON object only, with no code fences or prose.",
      ),
    );
    response = await sendMessage(
      messages,
      { ...config, webSearchEnabled: false },
      systemPrompt,
      { signal, onDelta },
    );
    if (signal?.aborted || response.stopped) throw abortError();
    usages.push(response.usage);
    if (response.error) throw new CvGenerationError(response.error);
    parsed = parseGeneratedCvJson(response.content);
  }

  if (!parsed) {
    throw new CvGenerationError(
      "The model did not return a usable CV. Try again or start from your profile and edit manually.",
    );
  }

  const document = markAiSections(
    mergeGeneratedCv(parsed, base, options),
    CV_SECTIONS,
  );
  const lastUsage = makeCvUsage("generate", config, usages);
  return {
    ...document,
    contentLanguage: options.language,
    ...(lastUsage ? { lastUsage } : {}),
  };
}
