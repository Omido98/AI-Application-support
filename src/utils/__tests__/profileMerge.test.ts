import { describe, expect, it } from "vitest";
import { applyImportedProfile } from "@/utils/profileMerge";
import type { ProfileData } from "@/types";

function profile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    fullName: "",
    email: "",
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
    skills: [],
    languages: [],
    ...overrides,
  };
}

describe("applyImportedProfile", () => {
  it("merges by filling empty details and appending new entries", () => {
    const current = profile({
      fullName: "Jane Doe",
      email: "",
      skills: [{ id: "s1", name: "TypeScript" }],
      coverLetters: [
        { id: "c1", content: "Hello", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    const imported = profile({
      fullName: "Imported Name",
      email: "jane@example.com",
      skills: [
        { id: "s2", name: "typescript" },
        { id: "s3", name: "React" },
      ],
      languages: [{ id: "l1", name: "Danish", fluency: "Fluent" }],
    });

    const merged = applyImportedProfile(current, imported, "merge");
    expect(merged.fullName).toBe("Jane Doe");
    expect(merged.email).toBe("jane@example.com");
    expect(merged.skills.map((skill) => skill.name)).toEqual([
      "TypeScript",
      "React",
    ]);
    expect(merged.languages).toHaveLength(1);
    expect(merged.coverLetters).toHaveLength(1);
  });

  it("replaces CV sections but keeps saved cover letters", () => {
    const current = profile({
      fullName: "Jane",
      coverLetterSummary: "Summary",
      coverLetters: [
        { id: "c1", content: "Hello", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
      skills: [{ id: "s1", name: "Old" }],
    });
    const imported = profile({
      fullName: "Imported",
      skills: [{ id: "s2", name: "New" }],
    });

    const replaced = applyImportedProfile(current, imported, "replace");
    expect(replaced.fullName).toBe("Imported");
    expect(replaced.skills.map((skill) => skill.name)).toEqual(["New"]);
    expect(replaced.coverLetters).toHaveLength(1);
    expect(replaced.coverLetterSummary).toBe("Summary");
  });
});
