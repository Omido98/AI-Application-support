// ============================================================
// Core domain types for AI Application Support
// ============================================================

/** Represents a conversation in the chat tab */
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  model: string;
}

/** A single message within a conversation */
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Application-level configuration */
export interface AppConfig {
  theme: "dark";
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  fontSize: number;
}

/** User profile stored locally */
export interface UserProfile {
  name: string;
  avatarUrl?: string;
  bio?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  language: string;
  autoSave: boolean;
  notificationsEnabled: boolean;
}

/** File reference for attachments or context */
export interface FileReference {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

/** Generic API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

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
}
