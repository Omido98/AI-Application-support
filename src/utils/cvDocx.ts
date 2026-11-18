import { invoke } from "@tauri-apps/api/core";
import type { CvDocument, CvSectionId } from "@/types/cv";
import { CV_SECTION_LABELS } from "@/utils/cvLanguage";
import { getCvLayout } from "@/utils/cvLayout";
import { isTauriRuntime } from "@/utils/runtime";

const PAGE_SIZES = {
  a4: { width: 11_906, height: 16_838 },
  letter: { width: 12_240, height: 15_840 },
} as const;

function contactLines(document: CvDocument): string[] {
  const contact = document.contact;
  return [
    contact.email,
    contact.phone,
    contact.location,
    contact.linkedinUrl,
    contact.portfolioUrl,
    contact.githubUrl,
  ]
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasSection(document: CvDocument, section: CvSectionId): boolean {
  switch (section) {
    case "summary":
      return document.summary.trim().length > 0;
    case "skills":
      return document.skills.length > 0;
    case "experience":
      return document.experience.some((item) => item.included);
    case "education":
      return document.education.some((item) => item.included);
    case "projects":
      return document.projects.some((item) => item.included);
    case "certifications":
      return document.certifications.some((item) => item.included);
    case "languages":
      return document.languages.some((item) => item.included);
    case "other":
      return document.otherEngagements.some((item) => item.included);
  }
}

function safeFileName(document: CvDocument, company: string): string {
  const name = document.contact.fullName.trim() || "CV";
  const parts = [name.replace(/[^\p{L}\p{N}]+/gu, "-")]
    .concat(company.trim() ? [company.replace(/[^\p{L}\p{N}]+/gu, "-")] : [])
    .concat(["CV"])
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${parts || "CV"}.docx`;
}

/** Render a CV to ATS-safe DOCX: one column, no tables, images or text boxes. */
export async function renderCvDocx(document: CvDocument): Promise<Uint8Array> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    LineRuleType,
    Packer,
    Paragraph,
    TextRun,
  } = await import("docx");

  const compact = document.template === "compact";
  const layout = getCvLayout(document.pageSize, document.template);
  const headingSize = layout.headingPt * 2;
  const titleSize = layout.headlinePt * 2;
  const nameSize = layout.namePt * 2;
  const bodySize = layout.bodyPt * 2;
  const metaSize = layout.metaPt * 2;
  const contactSize = layout.contactPt * 2;
  const lineHeight = layout.linePt * 20;
  const margin = layout.marginPt * 20;
  const sectionBefore = layout.sectionGapPt * 20;
  const headingAfter = layout.headingAfterPt * 20;
  const bodyAfter = layout.bodyAfterPt * 20;
  const metaAfter = layout.metaAfterPt * 20;
  const bulletAfter = layout.bulletAfterPt * 20;
  const headerAfter = layout.headerAfterPt * 20;

  const heading = (section: CvSectionId) =>
    new Paragraph({
      spacing: { before: sectionBefore, after: headingAfter },
      border: {
        bottom: {
          color: "B8B2A7",
          space: 2,
          style: BorderStyle.SINGLE,
          size: 6,
        },
      },
      children: [
        new TextRun({
          text: compact
            ? CV_SECTION_LABELS[document.language][section].toUpperCase()
            : CV_SECTION_LABELS[document.language][section],
          bold: true,
          size: headingSize,
          color: "111111",
        }),
      ],
    });

  const body = (text: string) =>
    new Paragraph({
      spacing: { after: bodyAfter },
      children: [new TextRun({ text, size: bodySize })],
    });

  const muted = (text: string) =>
    new Paragraph({
      spacing: { after: metaAfter },
      children: [
        new TextRun({
          text,
          size: metaSize,
          color: "555555",
          italics: true,
        }),
      ],
    });

  const bullet = (text: string) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: bulletAfter },
      children: [new TextRun({ text, size: bodySize })],
    });

  const children: InstanceType<typeof Paragraph>[] = [];
  const contact = contactLines(document);
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: headerAfter },
      children: [
        new TextRun({
          text: document.contact.fullName.trim() || "Curriculum Vitae",
          bold: true,
          size: nameSize,
          color: "111111",
        }),
      ],
    }),
  );
  if (document.headline.trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: headerAfter },
        children: [
          new TextRun({
            text: document.headline.trim(),
            size: titleSize,
            italics: true,
            color: "333333",
          }),
        ],
      }),
    );
  }
  if (contact.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: headerAfter },
        children: [
          new TextRun({
            text: contact.join("  ·  "),
            size: contactSize,
            color: "444444",
          }),
        ],
      }),
    );
  }

  for (const section of document.sectionOrder) {
    if (!hasSection(document, section)) continue;

    if (section === "summary") {
      children.push(heading("summary"), body(document.summary.trim()));
    } else if (section === "skills") {
      children.push(heading("skills"), body(document.skills.join("  ·  ")));
    } else if (section === "experience") {
      children.push(heading("experience"));
      for (const item of document.experience) {
        if (!item.included) continue;
        const title = [item.role, item.company].filter(Boolean).join(" — ");
        if (title) {
          children.push(
            new Paragraph({
              spacing: { before: headingAfter, after: bulletAfter },
              children: [
                new TextRun({ text: title, bold: true, size: headingSize }),
              ],
            }),
          );
        }
        const meta = [item.startDate, item.endDate, item.location]
          .filter(Boolean)
          .join("  ·  ");
        if (meta) children.push(muted(meta));
        for (const bulletText of item.bullets)
          children.push(bullet(bulletText));
      }
    } else if (section === "education") {
      children.push(heading("education"));
      for (const item of document.education) {
        if (!item.included) continue;
        const title = [item.degree, item.field].filter(Boolean).join(", ");
        const line = [title, item.school].filter(Boolean).join(" — ");
        if (line) {
          children.push(
            new Paragraph({
              spacing: { before: headingAfter, after: bulletAfter },
              children: [
                new TextRun({ text: line, bold: true, size: headingSize }),
              ],
            }),
          );
        }
        const meta = [item.startDate, item.endDate]
          .filter(Boolean)
          .join("  ·  ");
        if (meta) children.push(muted(meta));
        for (const detail of item.details) children.push(bullet(detail));
      }
    } else if (section === "projects") {
      children.push(heading("projects"));
      for (const item of document.projects) {
        if (!item.included) continue;
        if (item.title.trim()) {
          children.push(
            new Paragraph({
              spacing: { before: headingAfter, after: bulletAfter },
              children: [
                new TextRun({
                  text: item.title.trim(),
                  bold: true,
                  size: headingSize,
                }),
              ],
            }),
          );
        }
        if (item.description.trim()) {
          children.push(body(item.description.trim()));
        }
        if (item.period.trim()) children.push(muted(item.period.trim()));
        for (const bulletText of item.bullets)
          children.push(bullet(bulletText));
      }
    } else if (section === "certifications") {
      children.push(heading("certifications"));
      for (const item of document.certifications) {
        if (!item.included) continue;
        children.push(
          body(
            [item.name, item.issuer, item.date].filter(Boolean).join("  ·  "),
          ),
        );
      }
    } else if (section === "languages") {
      children.push(heading("languages"));
      children.push(
        body(
          document.languages
            .filter((item) => item.included)
            .map((item) => [item.name, item.level].filter(Boolean).join(" — "))
            .join("  ·  "),
        ),
      );
    } else if (section === "other") {
      children.push(heading("other"));
      for (const item of document.otherEngagements) {
        if (!item.included) continue;
        const line = [item.role, item.organization].filter(Boolean).join(" — ");
        if (line) {
          children.push(
            new Paragraph({
              spacing: { before: headingAfter, after: bulletAfter },
              children: [
                new TextRun({ text: line, bold: true, size: headingSize }),
              ],
            }),
          );
        }
        const meta = [item.startDate, item.endDate]
          .filter(Boolean)
          .join("  ·  ");
        if (meta) children.push(muted(meta));
        for (const bulletText of item.bullets)
          children.push(bullet(bulletText));
      }
    }
  }

  const page = PAGE_SIZES[document.pageSize];
  const doc = new Document({
    title: `${document.contact.fullName.trim() || "CV"} — CV`,
    creator: "AI Application Support",
    description: "ATS-friendly CV generated from the candidate profile.",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: bodySize, color: "1A1A1A" },
          paragraph: {
            // `line` is in twips; without an explicit rule Word interprets it
            // as 240ths of a line (1.1 lines here) instead of the exact line
            // height used by the PDF/preview renderers.
            spacing: {
              after: bodyAfter,
              line: lineHeight,
              lineRule: LineRuleType.EXACT,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: page,
            margin: {
              top: margin,
              right: margin,
              bottom: margin,
              left: margin,
            },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Render and save a CV as DOCX. Returns the chosen path/name. */
export async function exportCvDocx(
  document: CvDocument,
  company: string,
): Promise<string | null> {
  const bytes = await renderCvDocx(document);
  const name = safeFileName(document, company);
  if (!isTauriRuntime()) {
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
    return name;
  }
  return invoke<string | null>("save_export_file", {
    defaultName: name,
    contents: Array.from(bytes),
  });
}
