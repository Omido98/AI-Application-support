import { invoke } from "@tauri-apps/api/core";
import type { CvDocument, CvSectionId } from "@/types/cv";
import { CV_SECTION_LABELS } from "@/utils/cvLanguage";
import { isTauriRuntime } from "@/utils/runtime";

function safePdfName(document: CvDocument, company: string): string {
  const name = document.contact.fullName.trim() || "CV";
  return `${[name, company.trim(), "CV"]
    .filter(Boolean)
    .map((part) => part.replace(/[^\p{L}\p{N}]+/gu, "-"))
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)}.pdf`;
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

/**
 * Render a CV as a selectable-text, single-column PDF. It deliberately mirrors
 * the ATS-safe DOCX layout rather than rasterising HTML.
 */
export async function renderCvPdf(document: CvDocument): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const compact = document.template === "compact";
  const doc = new jsPDF({
    unit: "pt",
    format: document.pageSize === "a4" ? "a4" : "letter",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = compact ? 54 : 60;
  const maxWidth = pageWidth - margin * 2;
  const bodySize = compact ? 9 : 9.5;
  const metaSize = compact ? 8 : 8.5;
  const headingSize = compact ? 9.5 : 10;
  const lineHeight = compact ? 12 : 13;

  let y = margin;
  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };
  const write = (
    text: string,
    {
      size = bodySize,
      font = "normal",
      color = 40,
      x = margin,
      align,
      width = maxWidth,
    }: {
      size?: number;
      font?: "normal" | "bold" | "italic";
      color?: number;
      x?: number;
      align?: "center" | "left";
      width?: number;
    } = {},
  ) => {
    doc.setFont("helvetica", font);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      if (align === "center") {
        doc.text(line, pageWidth / 2, y, { align: "center" });
      } else {
        doc.text(line, x, y);
      }
      y += lineHeight;
    }
  };
  const heading = (section: CvSectionId) => {
    ensureSpace(30);
    y += compact ? 6 : 8;
    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += headingSize + 3;
    write(
      compact
        ? CV_SECTION_LABELS[document.language][section].toUpperCase()
        : CV_SECTION_LABELS[document.language][section],
      { size: headingSize, font: "bold", color: 40 },
    );
    y += compact ? 2 : 3;
  };
  const bullet = (text: string) => {
    const lines = doc.splitTextToSize(text, maxWidth - 12) as string[];
    for (let index = 0; index < lines.length; index += 1) {
      ensureSpace(lineHeight);
      if (index === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(bodySize);
        doc.setTextColor(40);
        doc.text("•", margin, y);
      }
      doc.text(lines[index], margin + 12, y);
      y += lineHeight;
    }
  };

  write(document.contact.fullName.trim() || "Curriculum Vitae", {
    size: compact ? 17 : 19,
    font: "bold",
    color: 40,
    align: "center",
  });
  if (document.headline.trim()) {
    write(document.headline.trim(), {
      size: compact ? 10 : 10.5,
      font: "italic",
      color: 40,
      align: "center",
    });
  }
  const contact = [
    document.contact.email,
    document.contact.phone,
    document.contact.location,
    document.contact.linkedinUrl,
    document.contact.portfolioUrl,
    document.contact.githubUrl,
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  if (contact.length > 0) {
    write(contact.join("  ·  "), {
      size: compact ? 8 : 8.5,
      color: 40,
      align: "center",
    });
  }
  y += compact ? 8 : 10;

  for (const section of document.sectionOrder) {
    if (!hasSection(document, section)) continue;
    if (section === "summary") {
      heading("summary");
      write(document.summary.trim());
    } else if (section === "skills") {
      heading("skills");
      write(document.skills.join("  ·  "));
    } else if (section === "experience") {
      heading("experience");
      for (const item of document.experience) {
        if (!item.included) continue;
        const title = [item.role, item.company].filter(Boolean).join(" — ");
        if (title) {
          ensureSpace(lineHeight + 2);
          write(title, { font: "bold", color: 40 });
        }
        const meta = [item.startDate, item.endDate, item.location]
          .filter(Boolean)
          .join("  ·  ");
        if (meta) write(meta, { size: metaSize, font: "italic", color: 40 });
        for (const text of item.bullets) bullet(text);
        y += 3;
      }
    } else if (section === "education") {
      heading("education");
      for (const item of document.education) {
        if (!item.included) continue;
        const title = [item.degree, item.field, item.school]
          .filter(Boolean)
          .join(" — ");
        if (title) write(title, { font: "bold", color: 40 });
        const meta = [item.startDate, item.endDate]
          .filter(Boolean)
          .join("  ·  ");
        if (meta) write(meta, { size: metaSize, font: "italic", color: 40 });
        for (const detail of item.details) bullet(detail);
        y += 3;
      }
    } else if (section === "projects") {
      heading("projects");
      for (const item of document.projects) {
        if (!item.included) continue;
        if (item.title.trim()) {
          write(item.title.trim(), { font: "bold", color: 40 });
        }
        if (item.description.trim()) write(item.description.trim());
        if (item.period.trim()) {
          write(item.period.trim(), {
            size: metaSize,
            font: "italic",
            color: 40,
          });
        }
        for (const text of item.bullets) bullet(text);
        y += 3;
      }
    } else if (section === "certifications") {
      heading("certifications");
      for (const item of document.certifications) {
        if (!item.included) continue;
        write(
          [item.name, item.issuer, item.date].filter(Boolean).join("  ·  "),
        );
      }
    } else if (section === "languages") {
      heading("languages");
      write(
        document.languages
          .filter((item) => item.included)
          .map((item) => [item.name, item.level].filter(Boolean).join(" — "))
          .join("  ·  "),
      );
    } else if (section === "other") {
      heading("other");
      for (const item of document.otherEngagements) {
        if (!item.included) continue;
        const title = [item.role, item.organization]
          .filter(Boolean)
          .join(" — ");
        if (title) write(title, { font: "bold", color: 40 });
        const meta = [item.startDate, item.endDate]
          .filter(Boolean)
          .join("  ·  ");
        if (meta) write(meta, { size: metaSize, font: "italic", color: 40 });
        for (const text of item.bullets) bullet(text);
        y += 3;
      }
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Render and save a CV as PDF. Returns the chosen path/name. */
export async function exportCvPdf(
  document: CvDocument,
  company: string,
): Promise<string | null> {
  const bytes = await renderCvPdf(document);
  const name = safePdfName(document, company);
  if (!isTauriRuntime()) {
    const blob = new Blob([bytes], { type: "application/pdf" });
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
