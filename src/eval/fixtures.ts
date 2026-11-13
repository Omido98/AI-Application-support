/**
 * Realistic, deterministic fixtures for the prompt/parsing eval.
 *
 * The job application fills every Phase 2 tracker field; the profile fills
 * every section the prompt builders render. These are plain objects: no
 * storage, clocks, or Tauri APIs are involved.
 */
import type { JobApplication, ProfileData } from "@/types";
import {
  applicationContextFrom,
  type ApplicationContext,
} from "@/utils/systemPrompt";

export const PHASE_TWO_APPLICATION: JobApplication = {
  id: "app-northstar-senior-frontend",
  companyName: "Northstar Labs",
  jobTitle: "Senior Frontend Engineer",
  applicationUrl:
    "https://jobs.northstarlabs.example/roles/senior-frontend-engineer",
  status: "applied",
  jobDescription:
    "Northstar Labs builds planning tools for renewable-energy teams. Our web app is used by 40,000 field engineers across the Nordics, and we are rebuilding its design system and offline-first data layer.\n\nWe are hiring a Senior Frontend Engineer to own the design system and the offline sync experience. You will work with product designers and a small platform team, ship accessible React interfaces, and cut the time it takes to file a field report from minutes to seconds.",
  applicationLanguage: "English",
  requirements:
    "- 5+ years building production web applications with TypeScript and React.\n- Experience owning or contributing to a design system used by multiple teams.\n- Strong understanding of accessibility (WCAG 2.2 AA) and browser performance.\n- Experience with offline-first data sync (IndexedDB, service workers, or CRDTs).\n- Comfortable working hybrid in Copenhagen, three days per week on site.\n- Danish and English at a professional level.",
  companyResearch:
    "Northstar Labs raised a EUR 12M Series A in March 2026 and announced a partnership with Energinet in August 2026. Their engineering blog describes a move from REST polling to local-first sync with ElectricSQL. Recent hires include a Head of Design Systems from Monta.",
  notes:
    "Referred by Jonas on the platform team. Recruiter said the process is two interviews plus a paid take-home.",
  location: "Copenhagen, Denmark (hybrid)",
  workMode: "hybrid",
  salary: "DKK 650,000 - 750,000",
  source: "LinkedIn",
  priority: "high",
  tags: ["typescript", "design-systems", "referral"],
  appliedAt: "2026-10-28",
  deadline: "2026-11-20",
  followUpAt: "2026-11-27",
  contactName: "Maja Lind",
  contactEmail: "maja.lind@northstarlabs.example",
  statusHistory: [
    { status: "wishlist", at: "2026-10-20T09:00:00.000Z" },
    { status: "applied", at: "2026-10-28T14:30:00.000Z" },
  ],
  createdAt: "2026-10-20T09:00:00.000Z",
  updatedAt: "2026-10-28T14:30:00.000Z",
};

/** Prompt-facing context derived from the full Phase 2 application. */
export const APPLICATION_CONTEXT: ApplicationContext =
  applicationContextFrom(PHASE_TWO_APPLICATION);

/**
 * Core application fields only. Used to prove that empty Phase 2 details
 * are omitted instead of rendering empty labels.
 */
export const CORE_ONLY_CONTEXT: ApplicationContext = {
  company: "Northstar Labs",
  jobDescription: "Build the design system.",
  language: "English",
  requirements: "Portfolio and cover letter.",
  companyResearch: "",
};

export const PROFILE: ProfileData = {
  fullName: "Astrid Nyholm",
  email: "astrid.nyholm@example.dk",
  city: "Copenhagen",
  country: "Denmark",
  linkedinUrl: "https://www.linkedin.com/in/astridnyholm",
  coverLetterSummary:
    "- Wants to build tools that field workers can trust offline.\n- Enjoys mentoring junior developers and running accessibility reviews.\n- Drawn to Northstar Labs because of its local-first sync direction.",
  interests: [
    { id: "interest-1", name: "Trail running" },
    { id: "interest-2", name: "Ceramics" },
  ],
  education: [
    {
      id: "education-1",
      school: "DTU",
      degree: "BSc",
      programName: "Software Technology",
      major: "Computer Science",
      startMonth: "September",
      startYear: "2019",
      endMonth: "June",
      endYear: "2022",
      finalGrade: "10.0 (Danish 7-point scale)",
      courses: [
        "Algorithms",
        "Human-Computer Interaction",
        "Distributed Systems",
      ],
      thesisTitle: "Accessible data visualisation for field workers",
    },
  ],
  coverLetters: [
    {
      id: "cover-letter-1",
      company: "Fjordline Energy",
      content:
        "I have spent three years making field reporting less painful for technicians. The part I enjoy most is watching someone use a tool I built without needing a manual.",
      addedAt: "2025-02-14T10:00:00.000Z",
    },
    {
      id: "cover-letter-2",
      company: "Bright Cartography",
      content:
        "Maps were my way into software. I care about the moment a dense dataset becomes a decision someone can act on.",
      addedAt: "2024-08-02T10:00:00.000Z",
    },
  ],
  workExperience: [
    {
      id: "work-1",
      company: "Fjordline Energy",
      role: "Frontend Engineer",
      startMonth: "July",
      startYear: "2022",
      isCurrent: true,
      jobDescription:
        "Own the field reporting UI used by 1,800 technicians. Lead accessibility reviews, maintain the component library, and work with the platform team on offline caching.",
      projects: [
        {
          id: "project-1",
          name: "Field reporting redesign",
          startMonth: "January",
          startYear: "2024",
          isCurrent: false,
          endMonth: "June",
          endYear: "2025",
        },
        {
          id: "project-2",
          name: "Design system v2",
          startMonth: "March",
          startYear: "2025",
          isCurrent: true,
        },
      ],
    },
    {
      id: "work-2",
      company: "Bright Cartography",
      role: "Junior Developer",
      startMonth: "August",
      startYear: "2020",
      isCurrent: false,
      endMonth: "June",
      endYear: "2022",
      jobDescription:
        "Built map overlays and internal tooling in React while finishing a BSc at DTU.",
      projects: [],
    },
  ],
  otherEngagements: [
    {
      id: "engagement-1",
      organization: "Coding Club Copenhagen",
      role: "Volunteer Mentor",
      startMonth: "September",
      startYear: "2021",
      isCurrent: true,
      description:
        "Run a weekly frontend workshop for students switching into software.",
      achievements: [
        "Mentored 14 students through their first production pull request",
        "Organised three accessibility clinics with local meetups",
      ],
    },
  ],
  certifications: [
    {
      id: "certification-1",
      name: "AWS Certified Cloud Practitioner",
      expiryMonth: "March",
      expiryYear: "2027",
    },
    {
      id: "certification-2",
      name: "Certified Professional in Accessibility Core Competencies",
      expiryMonth: "September",
      expiryYear: "2028",
    },
  ],
  skills: [
    { id: "skill-1", name: "TypeScript" },
    { id: "skill-2", name: "React" },
    { id: "skill-3", name: "CSS" },
    { id: "skill-4", name: "Design Systems" },
    { id: "skill-5", name: "Accessibility" },
    { id: "skill-6", name: "IndexedDB" },
    { id: "skill-7", name: "Vitest" },
    { id: "skill-8", name: "Playwright" },
  ],
  languages: [
    { id: "language-1", name: "Danish", fluency: "Native" },
    { id: "language-2", name: "English", fluency: "Fluent" },
    { id: "language-3", name: "German", fluency: "Intermediate" },
  ],
};

/** A draft deliberately full of the patterns the review/deslop passes target. */
export const DRAFT = `Dear Hiring Team,

I am writing to express my interest in the Senior Frontend Engineer role at Northstar Labs. I am passionate about renewable energy and I have leveraged my experience at Fjordline Energy to facilitate a robust, cutting-edge design system.

At Fjordline Energy, I led the design system v2 work — a multifaceted initiative that touched every product team. I streamlined component delivery and empowered engineers to ship 40% faster, which was a game changer for the organisation. I also used IndexedDB to build an offline cache for field reports.

I would love to discuss how I can bring this same energy to Northstar Labs.

Best regards,
Astrid Nyholm`;

export const CONVERSATION: { role: "user" | "assistant"; content: string }[] =
  [
    {
      role: "user",
      content: "Make the opening shorter and mention the design system work.",
    },
    {
      role: "assistant",
      content:
        "Here is a shorter opening that names the design system project.",
    },
    {
      role: "user",
      content: "Keep it under 250 words and avoid the word passionate.",
    },
  ];
