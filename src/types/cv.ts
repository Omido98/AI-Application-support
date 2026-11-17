/** Structured CV content. Rendered deterministically to an ATS-safe DOCX. */
export type CvLanguage = "en" | "sv";

export type CvPageSize = "a4" | "letter";

/** The two ATS-safe layouts; both remain single-column and image-free. */
export type CvTemplate = "classic" | "compact";

export type CvSectionId =
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "projects"
  | "certifications"
  | "languages"
  | "other";

export const CV_SECTIONS: CvSectionId[] = [
  "summary",
  "skills",
  "experience",
  "education",
  "projects",
  "certifications",
  "languages",
  "other",
];

export interface CvContact {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  portfolioUrl: string;
  githubUrl: string;
}

export interface CvExperience {
  id: string;
  /** Profile work-experience id when this entry came from the profile. */
  sourceId?: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
  included: boolean;
}

export interface CvEducation {
  id: string;
  sourceId?: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  details: string[];
  included: boolean;
}

export interface CvProject {
  id: string;
  sourceId?: string;
  title: string;
  description: string;
  period: string;
  bullets: string[];
  included: boolean;
}

export interface CvCertification {
  id: string;
  sourceId?: string;
  name: string;
  issuer: string;
  date: string;
  included: boolean;
}

export interface CvLanguageSkill {
  id: string;
  sourceId?: string;
  name: string;
  level: string;
  included: boolean;
}

export interface CvOtherEngagement {
  id: string;
  sourceId?: string;
  organization: string;
  role: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
  included: boolean;
}

/** Token/cost metadata for one AI CV action. */
export interface CvAiUsage {
  kind: "generate" | "rewrite";
  at: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Estimated USD cost when the model has a known price. */
  costUsd?: number;
}

export interface CvDocument {
  schemaVersion: 1;
  language: CvLanguage;
  /** Language the body prose was generated in; can differ after a headings-only switch. */
  contentLanguage?: CvLanguage;
  pageSize: CvPageSize;
  template?: CvTemplate;
  generatedAt: string;
  updatedAt: string;
  /** Hash of the profile used for generation; detects stale drafts. */
  profileFingerprint: string;
  /** Application updatedAt used for generation; detects stale drafts. */
  applicationUpdatedAt: string;
  extraContext: string;
  contact: CvContact;
  headline: string;
  summary: string;
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  projects: CvProject[];
  certifications: CvCertification[];
  languages: CvLanguageSkill[];
  otherEngagements: CvOtherEngagement[];
  sectionOrder: CvSectionId[];
  /** Sections last written or rewritten with AI. */
  aiSections?: CvSectionId[];
  lastUsage?: CvAiUsage;
}

/** A persisted CV version. Stored separately from the active cv_<id>.json. */
export interface CvSnapshot {
  id: string;
  savedAt: string;
  label: string;
  document: CvDocument;
}

/** One textual section the AI can rewrite in place. */
export type CvRewriteKind = "summary" | "experience" | "project" | "other";

export interface CvRewriteTarget {
  kind: CvRewriteKind;
  /** Experience/project/other entry id for non-summary targets. */
  id?: string;
}
