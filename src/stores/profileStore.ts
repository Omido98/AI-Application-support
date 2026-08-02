import { create } from "zustand";
import { saveJson, loadJson } from "@/utils/storage";
import type {
  Education,
  CoverLetter,
  WorkExperience,
  Certification,
  Skill,
  Language,
  ProfileData,
} from "@/types";

// ──────────────────────────────────────────────
// Debounced auto-save helper
// ──────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const s = useProfileStore.getState();
    const data: ProfileData = {
      education: s.education,
      coverLetters: s.coverLetters,
      workExperience: s.workExperience,
      certifications: s.certifications,
      skills: s.skills,
      languages: s.languages,
    };
    await saveJson("profile.json", data);
  }, 500);
}

// ──────────────────────────────────────────────
// Store interface
// ──────────────────────────────────────────────

interface ProfileState extends ProfileData {
  isLoaded: boolean;

  /** Load profile.json from disk (or localStorage fallback) */
  loadProfile: () => Promise<void>;

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
  education: [],
  coverLetters: [],
  workExperience: [],
  certifications: [],
  skills: [],
  languages: [],
  isLoaded: false,

  // ── Load ──
  loadProfile: async () => {
    const data = await loadJson<ProfileData>("profile.json");
    if (data) {
      set({
        education: data.education ?? [],
        coverLetters: data.coverLetters ?? [],
        workExperience: data.workExperience ?? [],
        certifications: data.certifications ?? [],
        skills: data.skills ?? [],
        languages: data.languages ?? [],
        isLoaded: true,
      });
    } else {
      set({ isLoaded: true });
    }
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
