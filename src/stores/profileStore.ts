import { create } from "zustand";
import { saveJson, loadJson } from "@/utils/storage";
import type {
  Education,
  CoverLetter,
  WorkExperience,
  OtherEngagement,
  Certification,
  Skill,
  Language,
  Interest,
  ProfileData,
} from "@/types";

// ──────────────────────────────────────────────
// Debounced auto-save helper
// ──────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function writeSnapshot() {
  const s = useProfileStore.getState();
  const data: ProfileData = {
    fullName: s.fullName,
    email: s.email,
    city: s.city,
    country: s.country,
    linkedinUrl: s.linkedinUrl,
    bio: s.bio,
    interests: s.interests,
    education: s.education,
    coverLetters: s.coverLetters,
    workExperience: s.workExperience,
    otherEngagements: s.otherEngagements,
    certifications: s.certifications,
    skills: s.skills,
    languages: s.languages,
  };
  return saveJson("profile.json", data);
}

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await writeSnapshot();
  }, 500);
}

/** Flush any pending debounced save immediately (called on window close). */
export async function flushProfileSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    await writeSnapshot();
  }
}

// ──────────────────────────────────────────────
// Store interface
// ──────────────────────────────────────────────

interface ProfileState extends ProfileData {
  isLoaded: boolean;

  /** Load profile.json from disk (or localStorage fallback) */
  loadProfile: () => Promise<void>;

  /** Set the personal details (name, contact, location, linkedin URL) */
  setPersonalDetails: (
    patch: Partial<
      Pick<ProfileData, "fullName" | "email" | "city" | "country" | "linkedinUrl">
    >,
  ) => void;

  /** Set the CV bio text */
  setBio: (value: string) => void;

  // Education actions
  setEducation: (items: Education[]) => void;
  addEducation: (item: Education) => void;
  updateEducation: (id: string, patch: Partial<Education>) => void;
  removeEducation: (id: string) => void;

  // CoverLetter actions
  setCoverLetters: (items: CoverLetter[]) => void;
  addCoverLetter: (item: CoverLetter) => void;
  updateCoverLetter: (id: string, patch: Partial<CoverLetter>) => void;
  removeCoverLetter: (id: string) => void;

  // WorkExperience actions
  setWorkExperience: (items: WorkExperience[]) => void;
  addWorkExperience: (item: WorkExperience) => void;
  updateWorkExperience: (id: string, patch: Partial<WorkExperience>) => void;
  removeWorkExperience: (id: string) => void;

  // OtherEngagement actions
  setOtherEngagements: (items: OtherEngagement[]) => void;
  addOtherEngagement: (item: OtherEngagement) => void;
  updateOtherEngagement: (id: string, patch: Partial<OtherEngagement>) => void;
  removeOtherEngagement: (id: string) => void;

  // Certification actions
  setCertifications: (items: Certification[]) => void;
  addCertification: (item: Certification) => void;
  updateCertification: (id: string, patch: Partial<Certification>) => void;
  removeCertification: (id: string) => void;

  // Skill actions
  setSkills: (items: Skill[]) => void;
  addSkill: (item: Skill) => void;
  updateSkill: (id: string, patch: Partial<Skill>) => void;
  removeSkill: (id: string) => void;

  // Interest actions
  setInterests: (items: Interest[]) => void;
  addInterest: (item: Interest) => void;
  updateInterest: (id: string, patch: Partial<Interest>) => void;
  removeInterest: (id: string) => void;

  // Language actions
  setLanguages: (items: Language[]) => void;
  addLanguage: (item: Language) => void;
  updateLanguage: (id: string, patch: Partial<Language>) => void;
  removeLanguage: (id: string) => void;
}

// ──────────────────────────────────────────────
// Store implementation
// ──────────────────────────────────────────────

export const useProfileStore = create<ProfileState>((set) => ({
  // ── Data ──
  fullName: "",
  email: "",
  city: "",
  country: "",
  linkedinUrl: "",
  bio: "",
  interests: [],
  education: [],
  coverLetters: [],
  workExperience: [],
  otherEngagements: [],
  certifications: [],
  skills: [],
  languages: [],
  isLoaded: false,

  // ── Load ──
  loadProfile: async () => {
    const data = await loadJson<ProfileData>("profile.json");
    if (data) {
      set({
        fullName: data.fullName ?? "",
        email: data.email ?? "",
        city: data.city ?? "",
        country: data.country ?? "",
        linkedinUrl: data.linkedinUrl ?? "",
        bio: data.bio ?? "",
        interests: data.interests ?? [],
        education: data.education ?? [],
        coverLetters: data.coverLetters ?? [],
        workExperience: data.workExperience ?? [],
        otherEngagements: data.otherEngagements ?? [],
        certifications: data.certifications ?? [],
        skills: data.skills ?? [],
        languages: data.languages ?? [],
        isLoaded: true,
      });
    } else {
      set({ isLoaded: true });
    }
  },

  // ── Personal details ──
  setPersonalDetails: (patch) => {
    set(patch);
    debouncedSave();
  },

  // ── Bio ──
  setBio: (value) => {
    set({ bio: value });
    debouncedSave();
  },

  // ── Education ──
  setEducation: (items) => {
    set({ education: items });
    debouncedSave();
  },
  addEducation: (item) => {
    set((s) => ({ education: [...s.education, item] }));
    debouncedSave();
  },
  updateEducation: (id, patch) => {
    set((s) => ({
      education: s.education.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }));
    debouncedSave();
  },
  removeEducation: (id) => {
    set((s) => ({
      education: s.education.filter((e) => e.id !== id),
    }));
    debouncedSave();
  },

  // ── Cover Letters ──
  setCoverLetters: (items) => {
    set({ coverLetters: items });
    debouncedSave();
  },
  addCoverLetter: (item) => {
    set((s) => ({ coverLetters: [...s.coverLetters, item] }));
    debouncedSave();
  },
  updateCoverLetter: (id, patch) => {
    set((s) => ({
      coverLetters: s.coverLetters.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
    debouncedSave();
  },
  removeCoverLetter: (id) => {
    set((s) => ({
      coverLetters: s.coverLetters.filter((c) => c.id !== id),
    }));
    debouncedSave();
  },

  // ── Work Experience ──
  setWorkExperience: (items) => {
    set({ workExperience: items });
    debouncedSave();
  },
  addWorkExperience: (item) => {
    set((s) => ({ workExperience: [...s.workExperience, item] }));
    debouncedSave();
  },
  updateWorkExperience: (id, patch) => {
    set((s) => ({
      workExperience: s.workExperience.map((w) =>
        w.id === id ? { ...w, ...patch } : w,
      ),
    }));
    debouncedSave();
  },
  removeWorkExperience: (id) => {
    set((s) => ({
      workExperience: s.workExperience.filter((w) => w.id !== id),
    }));
    debouncedSave();
  },

  // ── Other Engagements ──
  setOtherEngagements: (items) => {
    set({ otherEngagements: items });
    debouncedSave();
  },
  addOtherEngagement: (item) => {
    set((s) => ({ otherEngagements: [...s.otherEngagements, item] }));
    debouncedSave();
  },
  updateOtherEngagement: (id, patch) => {
    set((s) => ({
      otherEngagements: s.otherEngagements.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }));
    debouncedSave();
  },
  removeOtherEngagement: (id) => {
    set((s) => ({
      otherEngagements: s.otherEngagements.filter((e) => e.id !== id),
    }));
    debouncedSave();
  },

  // ── Certifications ──
  setCertifications: (items) => {
    set({ certifications: items });
    debouncedSave();
  },
  addCertification: (item) => {
    set((s) => ({ certifications: [...s.certifications, item] }));
    debouncedSave();
  },
  updateCertification: (id, patch) => {
    set((s) => ({
      certifications: s.certifications.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
    debouncedSave();
  },
  removeCertification: (id) => {
    set((s) => ({
      certifications: s.certifications.filter((c) => c.id !== id),
    }));
    debouncedSave();
  },

  // ── Skills ──
  setSkills: (items) => {
    set({ skills: items });
    debouncedSave();
  },
  addSkill: (item) => {
    set((s) => ({ skills: [...s.skills, item] }));
    debouncedSave();
  },
  updateSkill: (id, patch) => {
    set((s) => ({
      skills: s.skills.map((sk) =>
        sk.id === id ? { ...sk, ...patch } : sk,
      ),
    }));
    debouncedSave();
  },
  removeSkill: (id) => {
    set((s) => ({
      skills: s.skills.filter((sk) => sk.id !== id),
    }));
    debouncedSave();
  },

  // ── Interests ──
  setInterests: (items) => {
    set({ interests: items });
    debouncedSave();
  },
  addInterest: (item) => {
    set((s) => ({ interests: [...s.interests, item] }));
    debouncedSave();
  },
  updateInterest: (id, patch) => {
    set((s) => ({
      interests: s.interests.map((it) =>
        it.id === id ? { ...it, ...patch } : it,
      ),
    }));
    debouncedSave();
  },
  removeInterest: (id) => {
    set((s) => ({
      interests: s.interests.filter((it) => it.id !== id),
    }));
    debouncedSave();
  },

  // ── Languages ──
  setLanguages: (items) => {
    set({ languages: items });
    debouncedSave();
  },
  addLanguage: (item) => {
    set((s) => ({ languages: [...s.languages, item] }));
    debouncedSave();
  },
  updateLanguage: (id, patch) => {
    set((s) => ({
      languages: s.languages.map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    }));
    debouncedSave();
  },
  removeLanguage: (id) => {
    set((s) => ({
      languages: s.languages.filter((l) => l.id !== id),
    }));
    debouncedSave();
  },
}));
