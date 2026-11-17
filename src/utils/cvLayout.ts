import type { CvPageSize, CvTemplate } from "@/types/cv";

export const PT_TO_PX = 96 / 72;
export const PT_TO_TWIPS = 20;
export const PT_TO_HALF_POINTS = 2;

const PAGE_POINTS: Record<CvPageSize, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

interface TemplateMetrics {
  marginPt: number;
  namePt: number;
  headlinePt: number;
  contactPt: number;
  headingPt: number;
  bodyPt: number;
  metaPt: number;
  linePt: number;
  sectionGapPt: number;
  headerAfterPt: number;
  headingAfterPt: number;
  bodyAfterPt: number;
  metaAfterPt: number;
  bulletAfterPt: number;
}

const TEMPLATE_METRICS: Record<CvTemplate, TemplateMetrics> = {
  classic: {
    marginPt: 36,
    namePt: 18,
    headlinePt: 11,
    contactPt: 9,
    headingPt: 11,
    bodyPt: 10.5,
    metaPt: 9,
    linePt: 13.2,
    sectionGapPt: 10,
    headerAfterPt: 8,
    headingAfterPt: 5,
    bodyAfterPt: 3,
    metaAfterPt: 2,
    bulletAfterPt: 1.5,
  },
  compact: {
    marginPt: 30,
    namePt: 16,
    headlinePt: 10,
    contactPt: 8.5,
    headingPt: 10,
    bodyPt: 10,
    metaPt: 8,
    linePt: 12,
    sectionGapPt: 7,
    headerAfterPt: 6,
    headingAfterPt: 4,
    bodyAfterPt: 2,
    metaAfterPt: 1.5,
    bulletAfterPt: 1,
  },
};

export interface CvLayout extends TemplateMetrics {
  template: CvTemplate;
  pageSize: CvPageSize;
  pageWidthPt: number;
  pageHeightPt: number;
  pageWidthPx: number;
  pageHeightPx: number;
  marginPx: number;
  namePx: number;
  headlinePx: number;
  contactPx: number;
  headingPx: number;
  bodyPx: number;
  metaPx: number;
  linePx: number;
  sectionGapPx: number;
  headerAfterPx: number;
  headingAfterPx: number;
  bodyAfterPx: number;
  metaAfterPx: number;
  bulletAfterPx: number;
}

/**
 * The single source of truth for both export formats and the HTML preview.
 * PDF uses pt, DOCX uses twips/half-points, and the preview uses CSS px.
 */
export function getCvLayout(
  pageSize: CvPageSize,
  template: CvTemplate = "classic",
): CvLayout {
  const page = PAGE_POINTS[pageSize];
  const metrics = TEMPLATE_METRICS[template];
  const toPx = (value: number) => value * PT_TO_PX;
  return {
    ...metrics,
    template,
    pageSize,
    pageWidthPt: page.width,
    pageHeightPt: page.height,
    pageWidthPx: Math.round(toPx(page.width)),
    pageHeightPx: Math.round(toPx(page.height)),
    marginPx: toPx(metrics.marginPt),
    namePx: toPx(metrics.namePt),
    headlinePx: toPx(metrics.headlinePt),
    contactPx: toPx(metrics.contactPt),
    headingPx: toPx(metrics.headingPt),
    bodyPx: toPx(metrics.bodyPt),
    metaPx: toPx(metrics.metaPt),
    linePx: toPx(metrics.linePt),
    sectionGapPx: toPx(metrics.sectionGapPt),
    headerAfterPx: toPx(metrics.headerAfterPt),
    headingAfterPx: toPx(metrics.headingAfterPt),
    bodyAfterPx: toPx(metrics.bodyAfterPt),
    metaAfterPx: toPx(metrics.metaAfterPt),
    bulletAfterPx: toPx(metrics.bulletAfterPt),
  };
}
