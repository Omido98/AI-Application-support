import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CvDocument, CvSectionId } from "@/types/cv";
import { CV_SECTION_LABELS } from "@/utils/cvLanguage";
import { getCvLayout, type CvLayout } from "@/utils/cvLayout";
import {
  experienceRangeLabel,
  roleDateRange,
  sortCvRoles,
} from "@/utils/cvExperience";
import HighlightedText from "@/components/cv/HighlightedText";

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

function Section({
  title,
  layout,
  children,
}: {
  title: string;
  layout: CvLayout;
  children: ReactNode;
}) {
  return (
    <section
      className="break-inside-avoid"
      style={{ marginTop: `${layout.sectionGapPx}px` }}
    >
      <h3
        className={
          layout.template === "compact"
            ? "border-b border-neutral-400 pb-1 font-bold uppercase tracking-wide text-neutral-900"
            : "border-b border-neutral-400 pb-1 font-bold text-neutral-900"
        }
        style={{
          fontSize: `${layout.headingPx}px`,
          lineHeight: `${layout.headingPx * 1.25}px`,
        }}
      >
        {title}
      </h3>
      <div
        className="space-y-1.5 text-neutral-800"
        style={{
          marginTop: `${layout.headingAfterPx}px`,
          fontSize: `${layout.bodyPx}px`,
          lineHeight: `${layout.linePx}px`,
        }}
      >
        {children}
      </div>
    </section>
  );
}

/** Print-like HTML preview of the structured CV, matching the DOCX layout. */
export default function CvPreview({
  document,
  highlightTerms = [],
  onPageCount,
}: {
  document: CvDocument;
  highlightTerms?: string[];
  onPageCount?: (pages: number) => void;
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const [pages, setPages] = useState(1);
  const layout = getCvLayout(document.pageSize, document.template);
  const pageHeight = layout.pageHeightPx;
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
  const labels = CV_SECTION_LABELS[document.language];

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const measure = () => {
      const next = Math.max(1, Math.ceil(article.scrollHeight / pageHeight));
      setPages(next);
      onPageCount?.(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(article);
    return () => observer.disconnect();
  }, [onPageCount, pageHeight]);

  return (
    <div
      className="relative mx-auto w-full"
      style={{ maxWidth: `${layout.pageWidthPx}px` }}
    >
      <article
        ref={articleRef}
        aria-label="CV preview"
        data-template={layout.template}
        className="w-full bg-white text-neutral-900 shadow-sm ring-1 ring-black/10"
        style={{
          minHeight: `${layout.pageHeightPx}px`,
          padding: `${layout.marginPx}px`,
        }}
      >
        <header className="text-center">
          <h2
            className="font-bold tracking-tight"
            style={{
              fontSize: `${layout.namePx}px`,
              lineHeight: `${layout.namePx * 1.1}px`,
            }}
          >
            {document.contact.fullName.trim() || "Curriculum Vitae"}
          </h2>
          {document.headline.trim() && (
            <p
              className="italic text-neutral-700"
              style={{
                marginTop: `${layout.headerAfterPx / 3}px`,
                fontSize: `${layout.headlinePx}px`,
                lineHeight: `${layout.headlinePx * 1.35}px`,
              }}
            >
              <HighlightedText
                text={document.headline.trim()}
                terms={highlightTerms}
              />
            </p>
          )}
          {contact.length > 0 && (
            <p
              className="text-neutral-600"
              style={{
                marginTop: `${layout.headerAfterPx / 3}px`,
                fontSize: `${layout.contactPx}px`,
                lineHeight: `${layout.contactPx * 1.35}px`,
              }}
            >
              {contact.join("  ·  ")}
            </p>
          )}
        </header>

        {document.sectionOrder.map((section) => {
          if (!hasSection(document, section)) return null;
          if (section === "summary") {
            return (
              <Section key={section} title={labels[section]} layout={layout}>
                <p className="whitespace-pre-line">
                  <HighlightedText
                    text={document.summary.trim()}
                    terms={highlightTerms}
                  />
                </p>
              </Section>
            );
          }
          if (section === "skills") {
            return (
              <Section key={section} title={labels[section]} layout={layout}>
                <p>
                  <HighlightedText
                    text={document.skills.join("  ·  ")}
                    terms={highlightTerms}
                  />
                </p>
              </Section>
            );
          }
          if (section === "experience") {
            return (
              <Section key={section} title={labels[section]} layout={layout}>
                {document.experience
                  .filter((item) => item.included)
                  .map((item) => {
                    const roles = sortCvRoles(item.roles);
                    const range = experienceRangeLabel(item, document.language);
                    const employer = [item.company, item.location]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div key={item.id} className="break-inside-avoid">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 font-bold">
                            <HighlightedText
                              text={employer}
                              terms={highlightTerms}
                            />
                          </p>
                          {range && (
                            <p
                              className="shrink-0 italic text-neutral-600"
                              style={{
                                fontSize: `${layout.metaPx}px`,
                                lineHeight: `${layout.metaPx * 1.3}px`,
                              }}
                            >
                              {range}
                            </p>
                          )}
                        </div>
                        {roles.map((role) => {
                          const dates = roleDateRange(role, document.language);
                          const showDates = roles.length > 1 ? dates : "";
                          if (!role.title.trim() && !showDates) return null;
                          return (
                            <div
                              key={role.id}
                              className="flex items-baseline justify-between gap-3"
                              style={{
                                paddingLeft: `${layout.roleIndentPx}px`,
                              }}
                            >
                              <p className="min-w-0">
                                <HighlightedText
                                  text={role.title}
                                  terms={highlightTerms}
                                />
                              </p>
                              {showDates && (
                                <p
                                  className="shrink-0 italic text-neutral-600"
                                  style={{
                                    fontSize: `${layout.metaPx}px`,
                                    lineHeight: `${layout.metaPx * 1.3}px`,
                                  }}
                                >
                                  {showDates}
                                </p>
                              )}
                            </div>
                          );
                        })}
                        {item.bullets.length > 0 && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-5">
                            {item.bullets.map((bullet, index) => (
                              <li key={`${item.id}-${index}`}>
                                <HighlightedText
                                  text={bullet}
                                  terms={highlightTerms}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
              </Section>
            );
          }
          if (section === "education") {
            return (
              <Section key={section} title={labels[section]} layout={layout}>
                {document.education
                  .filter((item) => item.included)
                  .map((item) => (
                    <div key={item.id} className="break-inside-avoid">
                      <p className="font-bold">
                        <HighlightedText
                          text={[item.degree, item.field, item.school]
                            .filter(Boolean)
                            .join(" — ")}
                          terms={highlightTerms}
                        />
                      </p>
                      <p
                        className="italic text-neutral-600"
                        style={{
                          fontSize: `${layout.metaPx}px`,
                          lineHeight: `${layout.metaPx * 1.3}px`,
                        }}
                      >
                        {[item.startDate, item.endDate]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {item.details.map((detail, index) => (
                          <li key={`${item.id}-${index}`}>
                            <HighlightedText
                              text={detail}
                              terms={highlightTerms}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </Section>
            );
          }
          if (section === "projects") {
            return (
              <Section key={section} title={labels[section]} layout={layout}>
                {document.projects
                  .filter((item) => item.included)
                  .map((item) => (
                    <div key={item.id} className="break-inside-avoid">
                      {item.title.trim() && (
                        <p className="font-bold">
                          <HighlightedText
                            text={item.title.trim()}
                            terms={highlightTerms}
                          />
                        </p>
                      )}
                      {item.description.trim() && (
                        <p>
                          <HighlightedText
                            text={item.description.trim()}
                            terms={highlightTerms}
                          />
                        </p>
                      )}
                      {item.period.trim() && (
                        <p
                          className="italic text-neutral-600"
                          style={{
                            fontSize: `${layout.metaPx}px`,
                            lineHeight: `${layout.metaPx * 1.3}px`,
                          }}
                        >
                          {item.period.trim()}
                        </p>
                      )}
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {item.bullets.map((bullet, index) => (
                          <li key={`${item.id}-${index}`}>
                            <HighlightedText
                              text={bullet}
                              terms={highlightTerms}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </Section>
            );
          }
          if (section === "certifications") {
            return (
              <Section key={section} title={labels[section]} layout={layout}>
                {document.certifications
                  .filter((item) => item.included)
                  .map((item) => (
                    <p key={item.id}>
                      <HighlightedText
                        text={[item.name, item.issuer, item.date]
                          .filter(Boolean)
                          .join("  ·  ")}
                        terms={highlightTerms}
                      />
                    </p>
                  ))}
              </Section>
            );
          }
          if (section === "languages") {
            return (
              <Section key={section} title={labels[section]} layout={layout}>
                <p>
                  <HighlightedText
                    text={document.languages
                      .filter((item) => item.included)
                      .map((item) =>
                        [item.name, item.level].filter(Boolean).join(" — "),
                      )
                      .join("  ·  ")}
                    terms={highlightTerms}
                  />
                </p>
              </Section>
            );
          }
          return (
            <Section key={section} title={labels[section]} layout={layout}>
              {document.otherEngagements
                .filter((item) => item.included)
                .map((item) => (
                  <div key={item.id} className="break-inside-avoid">
                    <p className="font-bold">
                      <HighlightedText
                        text={[item.role, item.organization]
                          .filter(Boolean)
                          .join(" — ")}
                        terms={highlightTerms}
                      />
                    </p>
                    <p
                      className="italic text-neutral-600"
                      style={{
                        fontSize: `${layout.metaPx}px`,
                        lineHeight: `${layout.metaPx * 1.3}px`,
                      }}
                    >
                      {[item.startDate, item.endDate]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {item.bullets.map((bullet, index) => (
                        <li key={`${item.id}-${index}`}>
                          <HighlightedText
                            text={bullet}
                            terms={highlightTerms}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </Section>
          );
        })}
      </article>
      <div aria-hidden="true">
        {Array.from({ length: Math.max(0, pages - 1) }, (_, index) => (
          <div
            key={index}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-amber-500/70"
            style={{ top: `${(index + 1) * pageHeight}px` }}
          >
            <span className="absolute right-0 -top-5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
              Page {index + 2}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
