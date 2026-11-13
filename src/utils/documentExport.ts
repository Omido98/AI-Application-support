import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/utils/runtime";

export type ExportFormat = "pdf" | "docx";

/** Strip the Markdown the assistant writes so letters export as prose. */
export function plainTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slug(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "cover-letter"
  );
}

export function exportDocumentName(
  company: string,
  format: ExportFormat,
): string {
  return `${slug(company)}-${new Date().toISOString().slice(0, 10)}.${format}`;
}

async function saveDocument(
  bytes: Uint8Array,
  name: string,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    const blob = new Blob([bytes], {
      type: name.endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
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

/** Render a letter as an A4 PDF with Times body text and 1-inch margins. */
export async function renderCoverLetterPdf(text: string): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 72;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];

  let y = margin;
  const lineHeight = 18;
  for (const line of lines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Render a letter as a DOCX with Georgia body text and paragraph spacing. */
export async function renderCoverLetterDocx(text: string): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const paragraphs = text
    .split(/\n{2,}/)
    .map(
      (block) =>
        new Paragraph({
          spacing: { after: 200, line: 360 },
          children: block.split("\n").map(
            (line, index) =>
              new TextRun({
                text: line,
                font: "Georgia",
                size: 24,
                break: index > 0 ? 1 : undefined,
              }),
          ),
        }),
    );
  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Render and save a letter in one call. Returns the chosen path/name. */
export async function exportCoverLetter(
  markdown: string,
  company: string,
  format: ExportFormat,
): Promise<string | null> {
  const text = plainTextFromMarkdown(markdown);
  if (!text) throw new Error("There is no text to export.");
  const bytes =
    format === "pdf"
      ? await renderCoverLetterPdf(text)
      : await renderCoverLetterDocx(text);
  return saveDocument(bytes, exportDocumentName(company, format));
}
