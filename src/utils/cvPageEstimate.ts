import type { CvDocument } from "@/types/cv";

export interface CvPageEstimate {
  pages: number;
  pageHeight: number;
  overflow: boolean;
}

const PAGE_HEIGHT = { a4: 1123, letter: 1056 } as const;

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
 * the same section order and conservative line heights as the HTML preview;
 * the preview replaces this with a real scroll-height measurement.
 */
export function estimateCvPages(document: CvDocument): CvPageEstimate {
  let height = 110; // header and top padding
  let renderedSections = 0;

  const addSection = (contentHeight: number) => {
    renderedSections += 1;
    height += 30 + contentHeight + 16;
  };

  for (const section of document.sectionOrder) {
    if (section === "summary" && document.summary.trim()) {
      addSection(textLines(document.summary) * 19);
    } else if (section === "skills" && document.skills.length > 0) {
      addSection(Math.ceil(document.skills.length / 3) * 18);
    } else if (section === "experience") {
      const items = document.experience.filter((item) => item.included);
      if (items.length > 0) {
        addSection(
          items.reduce(
            (sum, item) =>
              sum + 42 + item.bullets.length * 19 + (item.location ? 10 : 0),
            0,
          ),
        );
      }
    } else if (section === "education") {
      const items = document.education.filter((item) => item.included);
      if (items.length > 0) {
        addSection(
          items.reduce((sum, item) => sum + 38 + item.details.length * 18, 0),
        );
      }
    } else if (section === "projects") {
      const items = document.projects.filter((item) => item.included);
      if (items.length > 0) {
        addSection(
          items.reduce(
            (sum, item) =>
              sum +
              34 +
              textLines(item.description) * 18 +
              item.bullets.length * 19,
            0,
          ),
        );
      }
    } else if (section === "certifications") {
      const items = document.certifications.filter((item) => item.included);
      if (items.length > 0) addSection(items.length * 18);
    } else if (section === "languages") {
      const items = document.languages.filter((item) => item.included);
      if (items.length > 0) addSection(18);
    } else if (section === "other") {
      const items = document.otherEngagements.filter((item) => item.included);
      if (items.length > 0) {
        addSection(
          items.reduce((sum, item) => sum + 34 + item.bullets.length * 19, 0),
        );
      }
    }
  }

  // Extra whitespace between cards is not part of the printed page, but the
  // estimate should not be optimistic when many tiny sections exist.
  height += Math.max(0, renderedSections - 1) * 4;

  const pageHeight = PAGE_HEIGHT[document.pageSize];
  const pages = Math.max(1, Math.ceil(height / pageHeight));
  return { pages, pageHeight, overflow: pages > 2 };
}
