// ============================================================
// Core domain types for AI Application Support
// ============================================================

// ============================================================
// Profile data types
// ============================================================

export interface Education {
  id: string;
  school: string;
  degree: string;
  programName: string;
  major: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  finalGrade: string;
  courses: string[];
  thesisTitle: string;
}

export interface CoverLetter {
  id: string;
  /** Optional name of the company/organization the letter was written for */
  company?: string;
  content: string;
  addedAt: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  role: string;
  startMonth: string;
  startYear: string;
  isCurrent: boolean;
  endMonth?: string;
  endYear?: string;
  jobDescription: string;
  projects: string[];
}

export interface Skill {
  id: string;
  name: string;
}

export interface Certification {
  id: string;
  name: string;
  expiryMonth: string;
  expiryYear: string;
}

export type FluencyLevel =
  | "Beginner"
  | "Elementary"
  | "Intermediate"
  | "Upper Intermediate"
  | "Advanced"
  | "Fluent"
  | "Native";

export interface Language {
  id: string;
  name: string;
  fluency: FluencyLevel;
}

export interface ProfileData {
  education: Education[];
  coverLetters: CoverLetter[];
  workExperience: WorkExperience[];
  certifications: Certification[];
  skills: Skill[];
  languages: Language[];
  /** Public profile URL (e.g. LinkedIn) the AI can reference for extra context. */
  linkedinUrl?: string;
}

export type ApplicationStatus =
  | "wishlist"
  | "applied"
  | "interview"
  | "offer"
  | "rejected";

/** A single tracked job application, with its own chat thread. */
export interface JobApplication {
  id: string;
  companyName: string;
  jobTitle: string;
  applicationUrl: string;
  status: ApplicationStatus;
  jobDescription: string;
  applicationLanguage: string;
  requirements: string;
  companyResearch: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
