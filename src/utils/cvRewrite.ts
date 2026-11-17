import type { JobApplication, ProfileData } from "@/types";
import type { TokenUsage } from "@/types";
import type { ChatMessage, ApiConfig } from "@/stores/chatStore";
import type { CvAiUsage, CvDocument, CvRewriteTarget } from "@/types/cv";
import { newMessageId } from "@/utils/ids";
import { sendMessage } from "@/utils/api";
import { buildCvRewritePrompt } from "@/utils/cvRewritePrompt";
import { findUnverifiedNumbersInText } from "@/utils/cvAts";
import { makeCvUsage } from "@/utils/cvUsage";
import { markAiSection, sectionForRewriteTarget } from "@/utils/cvProvenance";

export type CvRewriteResult =
  | {
      kind: "summary";
      headline: string;
      summary: string;
    }
  | {
      kind: "experience" | "other";
      bullets: string[];
    }
  | {
      kind: "project";
      title: string;
      description: string;
      bullets: string[];
    };

export interface CvRewriteArgs {
  application: JobApplication;
  profile: ProfileData;
  document: CvDocument;
  target: CvRewriteTarget;
  instruction: string;
  config: ApiConfig;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onUsage?: (usage: CvAiUsage) => void;
}

export interface CvRewriteProposal {
  target: CvRewriteTarget;
  label: string;
  result: CvRewriteResult;
  currentText: string;
  proposedText: string;
  warnings: string[];
  usage?: CvAiUsage;
}

/** The text a proposal would change, for the before/after diff. */
export function sectionText(
  document: CvDocument,
  target: CvRewriteTarget,
): string {
  if (target.kind === "summary") {
    return [document.headline, document.summary].filter(Boolean).join("\n\n");
  }
  if (target.kind === "experience") {
    return (
      document.experience
        .find((item) => item.id === target.id)
        ?.bullets.join("\n") ?? ""
    );
  }
  if (target.kind === "project") {
    const item = document.projects.find((entry) => entry.id === target.id);
    return item
      ? [item.title, item.description, ...item.bullets]
          .filter(Boolean)
          .join("\n")
      : "";
  }
  return (
    document.otherEngagements
      .find((item) => item.id === target.id)
      ?.bullets.join("\n") ?? ""
  );
}

/** Apply an accepted proposal to the document, preserving every other field. */
export function applyRewriteResult(
  document: CvDocument,
  target: CvRewriteTarget,
  result: CvRewriteResult,
  usage?: CvAiUsage,
): CvDocument {
  const section: CvDocument["sectionOrder"][number] =
    sectionForRewriteTarget(target);
  const withUsage: CvDocument = {
    ...markAiSection(document, section),
    ...(usage ? { lastUsage: usage } : {}),
  };
  if (result.kind === "summary") {
    return {
      ...withUsage,
      headline: result.headline || document.headline,
      summary: result.summary || document.summary,
    };
  }
  if (result.kind === "experience") {
    return {
      ...withUsage,
      experience: document.experience.map((item) =>
        item.id === target.id ? { ...item, bullets: result.bullets } : item,
      ),
    };
  }
  if (result.kind === "project") {
    return {
      ...withUsage,
      projects: document.projects.map((item) =>
        item.id === target.id
          ? {
              ...item,
              title: result.title || item.title,
              description: result.description || item.description,
              bullets: result.bullets,
            }
          : item,
      ),
    };
  }
  return {
    ...withUsage,
    otherEngagements: document.otherEngagements.map((item) =>
      item.id === target.id ? { ...item, bullets: result.bullets } : item,
    ),
  };
}

/** Build the review payload shown before the user accepts a rewrite. */
export function buildRewriteProposal(
  document: CvDocument,
  target: CvRewriteTarget,
  label: string,
  result: CvRewriteResult,
  profile: ProfileData,
  usage?: CvAiUsage,
): CvRewriteProposal {
  const proposed = applyRewriteResult(document, target, result);
  const proposedText = sectionText(proposed, target);
  return {
    target,
    label,
    result,
    currentText: sectionText(document, target),
    proposedText,
    warnings: findUnverifiedNumbersInText(
      label,
      proposedText,
      profile,
      document.extraContext,
    ),
    ...(usage ? { usage } : {}),
  };
}

export class CvRewriteError extends Error {}

interface RewriteJson {
  headline?: unknown;
  summary?: unknown;
  title?: unknown;
  description?: unknown;
  bullets?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanProse(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-•*]\s+/gm, "")
    .trim();
}

function asBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanProse(item))
    .filter(Boolean)
    .slice(0, 8);
}

/** Tolerant parse for a single rewritten section. */
export function parseCvRewriteJson(raw: string): RewriteJson | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const text = fenced?.[1] ?? raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as RewriteJson)
      : null;
  } catch {
    return null;
  }
}

function validateResult(
  target: CvRewriteTarget,
  content: RewriteJson,
): CvRewriteResult {
  if (target.kind === "summary") {
    const headline = cleanProse(asString(content.headline));
    const summary = cleanProse(asString(content.summary));
    if (!headline && !summary) {
      throw new CvRewriteError(
        "The model returned an empty summary. Try again or edit it manually.",
      );
    }
    return { kind: "summary", headline, summary };
  }

  if (target.kind === "project") {
    const title = cleanProse(asString(content.title));
    const description = cleanProse(asString(content.description));
    const bullets = asBullets(content.bullets);
    if (!description && bullets.length === 0) {
      throw new CvRewriteError(
        "The model returned an empty project rewrite. Try again or edit it manually.",
      );
    }
    return { kind: "project", title, description, bullets };
  }

  const bullets = asBullets(content.bullets);
  if (bullets.length === 0) {
    throw new CvRewriteError(
      "The model returned no bullets. Try again or edit them manually.",
    );
  }
  return { kind: target.kind, bullets };
}

function userMessage(content: string): ChatMessage {
  return {
    id: newMessageId(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Rewrite one CV section with the configured provider. The caller applies the
 * result to the document and is responsible for the undo snapshot.
 */
export async function rewriteCvSection({
  application,
  profile,
  document,
  target,
  instruction,
  config,
  signal,
  onDelta,
  onUsage,
}: CvRewriteArgs): Promise<CvRewriteResult> {
  if (!config.apiKey.trim()) {
    throw new CvRewriteError(
      "Add an API key in Settings before using AI rewriting.",
    );
  }

  const usages: (TokenUsage | undefined)[] = [];

  const systemPrompt = buildCvRewritePrompt(
    application,
    profile,
    document,
    target,
    instruction,
  );
  const messages: ChatMessage[] = [
    userMessage(
      "Rewrite the selected CV section now. Return only the JSON object described in the system prompt.",
    ),
  ];

  let response = await sendMessage(
    messages,
    { ...config, webSearchEnabled: false },
    systemPrompt,
    { signal, onDelta },
  );
  if (signal?.aborted) {
    const aborted = new Error("Rewrite cancelled.");
    aborted.name = "AbortError";
    throw aborted;
  }
  usages.push(response.usage);
  if (response.error) throw new CvRewriteError(response.error);

  let parsed = parseCvRewriteJson(response.content);
  if (!parsed) {
    messages.push({
      id: newMessageId(),
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
    });
    messages.push(
      userMessage(
        "Your previous response was not valid JSON. Return the rewritten section as one valid JSON object only, with no fences or prose.",
      ),
    );
    response = await sendMessage(
      messages,
      { ...config, webSearchEnabled: false },
      systemPrompt,
      { signal, onDelta },
    );
    if (signal?.aborted) {
      const aborted = new Error("Rewrite cancelled.");
      aborted.name = "AbortError";
      throw aborted;
    }
    usages.push(response.usage);
    if (response.error) throw new CvRewriteError(response.error);
    parsed = parseCvRewriteJson(response.content);
  }

  if (!parsed) {
    throw new CvRewriteError(
      "The model did not return a usable rewrite. Try again or edit the section manually.",
    );
  }
  const result = validateResult(target, parsed);
  const usage = makeCvUsage("rewrite", config, usages);
  if (usage) onUsage?.(usage);
  return result;
}
