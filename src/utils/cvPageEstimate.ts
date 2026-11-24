import type { CvDocument } from "@/types/cv";
import { getCvLayout } from "@/utils/cvLayout";

export interface CvPageEstimate {
  pages: number;
  pageHeight: number;
  overflow: boolean;
}

function textLines(text: string, charsPerLine = 92): number {
  if (!text.trim()) return 0;
  return text
    .split(/\r?\n/)
    .reduce(
      (sum, line) =>
        sum + Math.max(1, Math.ceil(line.trim().length / charsPerLine)),
      0,
    );
}

/**
 * A layout estimate for the editor, where the preview is not mounted. It uses
 * the shared template metrics; the preview replaces this with a real
 * scroll-height measurement.
 */
export function estimateCvPages(document: CvDocument): CvPageEstimate {
  const layout = getCvLayout(document.pageSize, document.template);
  const line = layout.linePx;
  const sectionHeader = layout.headingPx * 1.25 + layout.headingAfterPx;
  let height = layout.marginPx * 2 + layout.namePx * 1.2 + line * 2;
  let renderedSections = 0;

  const addSection = (contentHeight: number) => {
    renderedSections += 1;
    height += layout.sectionGapPx + sectionHeader + contentHeight;
  };

  for (const section of document.sectionOrder) {
    if (section === "summary" && document.summary.trim()) {
      addSection(textLines(document.summary) * line);
    } else if (section === "skills" && document.skills.length > 0) {
      addSection(Math.ceil(document.skills.length / 3) * line);
    } else if (section === "experience") {
      const items = document.experience.filter((item) => item.included);
      if (items.length > 0) {
        addSection(
          items.reduce(
            (sum, item) =>
              sum +
              line * 1.4 +
              item.roles.length * line * 1.1 +
              item.bullets.length * line,
            0,
          ),
        );
      }
    } else if (section === "education") {
      const items = document.education.filter((item) => item.included);
      if (items.length > 0) {
        addSection(
          items.reduce(
            (sum, item) => sum + line * 1.8 + item.details.length * line,
            0,
          ),
        );
      }
    } else if (section === "projects") {
      const items = document.projects.filter((item) => item.included);
      if (items.length > 0) {
        addSection(
          items.reduce(
            (sum, item) =>
              sum +
              line * 1.6 +
              textLines(item.description) * line +
              item.bullets.length * line,
            0,
          ),
        );
      }
    } else if (section === "certifications") {
      const items = document.certifications.filter((item) => item.included);
      if (items.length > 0) addSection(items.length * line);
    } else if (section === "languages") {
      const items = document.languages.filter((item) => item.included);
      if (items.length > 0) addSection(line);
    } else if (section === "other") {
      const items = document.otherEngagements.filter((item) => item.included);
      if (items.length > 0) {
        addSection(
          items.reduce(
            (sum, item) => sum + line * 1.6 + item.bullets.length * line,
            0,
          ),
        );
      }
    }
  }

  height += Math.max(0, renderedSections - 1) * layout.sectionGapPx * 0.35;

  const pageHeight = layout.pageHeightPx;
  const pages = Math.max(1, Math.ceil(height / pageHeight));
  return { pages, pageHeight, overflow: pages > 2 };
}
