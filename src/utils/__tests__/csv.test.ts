import { describe, expect, it } from "vitest";
import { applicationsToCsv, escapeCsv } from "@/utils/csv";
import type { JobApplication } from "@/types";

const base: JobApplication = {
  id: "a",
  companyName: "Acme",
  jobTitle: "Engineer",
  applicationUrl: "https://example.com/jobs/1",
  status: "applied",
  jobDescription: "",
  applicationLanguage: "English",
  requirements: "",
  companyResearch: "",
  notes: "",
  location: "Copenhagen",
  workMode: "hybrid",
  salary: "EUR 70k",
  source: "Referral",
  priority: "high",
  tags: ["remote", "fintech"],
  appliedAt: "2026-01-02",
  deadline: "2026-01-31",
  followUpAt: "",
  contactName: "Ada Lovelace",
  contactEmail: "ada@example.com",
  statusHistory: [{ status: "applied", at: "2026-01-02T00:00:00.000Z" }],
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

describe("applicationsToCsv", () => {
  it("writes a header and human-readable enum values", () => {
    const csv = applicationsToCsv([base]);
    const [header, row] = csv.split("\r\n");
    expect(header.startsWith("Company,Job title,Status,Priority")).toBe(true);
    expect(row).toContain("Applied");
    expect(row).toContain("High");
    expect(row).toContain("Hybrid");
    expect(row).toContain("remote; fintech");
  });

  it("escapes commas, quotes and newlines", () => {
    const csv = applicationsToCsv([
      {
        ...base,
        companyName: 'Acme, "Inc"',
        jobTitle: "Line\nBreak",
      },
    ]);
    expect(csv).toContain('"Acme, ""Inc"""');
    expect(csv).toContain('"Line\nBreak"');
  });

  it("neutralizes spreadsheet formula prefixes", () => {
    expect(escapeCsv("=1+1")).toBe("'=1+1");
    expect(escapeCsv("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsv("-5")).toBe("'-5");
    expect(escapeCsv("@cmd")).toBe("'@cmd");
    expect(escapeCsv('=HYPERLINK("https://evil.example")')).toBe(
      '"\'=HYPERLINK(""https://evil.example"")"',
    );
    expect(escapeCsv("Normal text")).toBe("Normal text");
  });
});
