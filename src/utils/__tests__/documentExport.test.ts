import { describe, expect, it } from "vitest";
import {
  exportDocumentName,
  plainTextFromMarkdown,
  renderCoverLetterDocx,
  renderCoverLetterPdf,
} from "@/utils/documentExport";

describe("plainTextFromMarkdown", () => {
  it("strips headings, emphasis, links and code markers", () => {
    const text = plainTextFromMarkdown(
      "## Dear hiring manager\n\nI am **very** interested in *this* role at [Acme](https://acme.test).\n\nUse `TypeScript` daily.",
    );
    expect(text).toBe(
      "Dear hiring manager\n\nI am very interested in this role at Acme.\n\nUse TypeScript daily.",
    );
  });
});

describe("exportDocumentName", () => {
  it("slugs the company and adds the date/extension", () => {
    expect(exportDocumentName("Acme, Inc.", "pdf")).toMatch(
      /^Acme-Inc-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(exportDocumentName("   ", "docx")).toMatch(
      /^cover-letter-\d{4}-\d{2}-\d{2}\.docx$/,
    );
  });
});

describe("document rendering", () => {
  it("produces a real PDF document", async () => {
    const bytes = await renderCoverLetterPdf(
      "Dear hiring manager,\n\nI would love to join Acme.",
    );
    expect(bytes.length).toBeGreaterThan(500);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  it("produces a DOCX (zip) document", async () => {
    const bytes = await renderCoverLetterDocx(
      "Dear hiring manager,\n\nI would love to join Acme.",
    );
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
