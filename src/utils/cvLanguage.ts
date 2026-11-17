import type { CvLanguage, CvSectionId } from "@/types/cv";

export const CV_SECTION_LABELS: Record<
  CvLanguage,
  Record<CvSectionId, string>
> = {
  en: {
    summary: "Professional Summary",
    skills: "Skills",
    experience: "Work Experience",
    education: "Education",
    projects: "Projects",
    certifications: "Certifications",
    languages: "Languages",
    other: "Other Experience",
  },
  sv: {
    summary: "Profil",
    skills: "Kompetenser",
    experience: "Arbetslivserfarenhet",
    education: "Utbildning",
    projects: "Projekt",
    certifications: "Certifieringar",
    languages: "Språk",
    other: "Övrig erfarenhet",
  },
};

export const CV_UI_TEXT: Record<
  CvLanguage,
  {
    present: string;
    pageA4: string;
    pageLetter: string;
  }
> = {
  en: {
    present: "Present",
    pageA4: "A4",
    pageLetter: "Letter",
  },
  sv: {
    present: "Nuvarande",
    pageA4: "A4",
    pageLetter: "Letter",
  },
};
