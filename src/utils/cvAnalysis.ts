import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";
import {
  analyzeCvAts,
  extractJobKeywords,
  extractJobPhrases,
  findUnverifiedNumbers,
  type CvAtsContext,
  type CvAtsReport,
} from "@/utils/cvAts";
import type { CvGroundingReport } from "@/utils/cvGrounding";
import { analyzeCvGrounding } from "@/utils/cvGrounding";

export interface CvAnalysis {
  ats: CvAtsReport;
  grounding: CvGroundingReport;
}

const jobContextCache = new WeakMap<JobApplication, CvAtsContext>();

/** Reuse parsed job keywords/phrases for a given application object. */
export function getCvJobContext(application: JobApplication): CvAtsContext {
  const cached = jobContextCache.get(application);
  if (cached) return cached;
  const text = [
    application.jobTitle,
    application.jobDescription,
    application.requirements,
  ].join("\n");
  const context: CvAtsContext = {
    keywords: extractJobKeywords(text),
    phrases: extractJobPhrases(text),
  };
  jobContextCache.set(application, context);
  return context;
}

/**
 * Run both deterministic audits from one document snapshot. Number grounding is
 * computed once and shared instead of being repeated by ATS and grounding.
 */
export function analyzeCvDocument(
  document: CvDocument,
  application: JobApplication,
  profile: ProfileData,
  context: CvAtsContext = getCvJobContext(application),
): CvAnalysis {
  const unverifiedNumbers = findUnverifiedNumbers(document, profile);
  return {
    ats: analyzeCvAts(
      document,
      application,
      profile,
      context,
      unverifiedNumbers,
    ),
    grounding: analyzeCvGrounding(document, profile, unverifiedNumbers),
  };
}
