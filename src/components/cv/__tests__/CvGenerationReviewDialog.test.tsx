import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";
import CvGenerationReviewDialog from "@/components/cv/CvGenerationReviewDialog";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

const profile: ProfileData = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  city: "",
  country: "",
  linkedinUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [],
  coverLetters: [],
  workExperience: [],
  otherEngagements: [],
  certifications: [],
  skills: [{ id: "skill-1", name: "TypeScript" }],
  languages: [],
};

const proposal: CvDocument = {
  schemaVersion: 1,
  language: "en",
  pageSize: "a4",
  template: "classic",
  generatedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  profileFingerprint: "fingerprint",
  applicationUpdatedAt: "2026-01-01T00:00:00.000Z",
  extraContext: "",
  contact: {
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "",
    location: "",
    linkedinUrl: "",
    portfolioUrl: "",
    githubUrl: "",
  },
  headline: "Platform Engineer",
  summary: "Builds reliable systems with TypeScript.",
  skills: ["TypeScript", "Accessibility"],
  experience: [
    {
      id: "role-1",
      company: "Acme",
      role: "Platform Engineer",
      location: "Remote",
      startDate: "Jan 2022",
      endDate: "Present",
      current: true,
      bullets: ["Reduced reporting time."],
      included: true,
    },
  ],
  education: [],
  projects: [],
  certifications: [],
  languages: [],
  otherEngagements: [],
  sectionOrder: ["summary", "skills", "experience"],
};

describe("CvGenerationReviewDialog", () => {
  it("shows the actual proposal and explicit accept/discard actions", () => {
    const html = renderToStaticMarkup(
      <CvGenerationReviewDialog
        open
        proposal={proposal}
        current={null}
        profile={profile}
        busy={false}
        onAccept={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(html).toContain("Review generated CV");
    expect(html).toContain("Platform Engineer");
    expect(html).toContain("Acme");
    expect(html).toContain("TypeScript");
    expect(html).toContain("Selected roles (1)");
    expect(html).toContain("Accept generated CV");
    expect(html).toContain("Discard");
  });
});
