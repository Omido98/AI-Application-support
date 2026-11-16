import type { ReactNode } from "react";
import type { CvDocument, CvSectionId } from "@/types/cv";
import { CV_SECTION_LABELS } from "@/utils/cvLanguage";

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h3 className="border-b border-neutral-400 pb-1 text-[13px] font-bold text-neutral-900">
        {title}
      </h3>
      <div className="mt-2 space-y-2 text-[12.5px] leading-[1.45] text-neutral-800">
        {children}
      </div>
    </section>
  );
}

/** Print-like HTML preview of the structured CV, matching the DOCX layout. */
export default function CvPreview({ document }: { document: CvDocument }) {
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

  return (
    <article
      aria-label="CV preview"
      className="mx-auto w-full max-w-[794px] bg-white px-6 py-8 text-neutral-900 shadow-sm ring-1 ring-black/10 sm:px-[52px] sm:py-[48px]"
      style={{ minHeight: document.pageSize === "a4" ? "1123px" : "1056px" }}
    >
      <header className="text-center">
        <h2 className="text-[28px] font-bold leading-tight tracking-tight">
          {document.contact.fullName.trim() || "Curriculum Vitae"}
        </h2>
        {document.headline.trim() && (
          <p className="mt-1 text-[13px] italic text-neutral-700">
            {document.headline.trim()}
          </p>
        )}
        {contact.length > 0 && (
          <p className="mt-2 text-[11px] text-neutral-600">
            {contact.join("  ·  ")}
          </p>
        )}
      </header>

      {document.sectionOrder.map((section) => {
        if (!hasSection(document, section)) return null;
        if (section === "summary") {
          return (
            <Section key={section} title={labels[section]}>
              <p className="whitespace-pre-line">{document.summary.trim()}</p>
            </Section>
          );
        }
        if (section === "skills") {
          return (
            <Section key={section} title={labels[section]}>
              <p>{document.skills.join("  ·  ")}</p>
            </Section>
          );
        }
        if (section === "experience") {
          return (
            <Section key={section} title={labels[section]}>
              {document.experience
                .filter((item) => item.included)
                .map((item) => (
                  <div key={item.id} className="break-inside-avoid">
                    <p className="font-bold">
                      {[item.role, item.company].filter(Boolean).join(" — ")}
                    </p>
                    <p className="text-[11px] italic text-neutral-600">
                      {[item.startDate, item.endDate, item.location]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {item.bullets.map((bullet, index) => (
                        <li key={`${item.id}-${index}`}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </Section>
          );
        }
        if (section === "education") {
          return (
            <Section key={section} title={labels[section]}>
              {document.education
                .filter((item) => item.included)
                .map((item) => (
                  <div key={item.id} className="break-inside-avoid">
                    <p className="font-bold">
                      {[item.degree, item.field, item.school]
                        .filter(Boolean)
                        .join(" — ")}
                    </p>
                    <p className="text-[11px] italic text-neutral-600">
                      {[item.startDate, item.endDate]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {item.details.map((detail, index) => (
                        <li key={`${item.id}-${index}`}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </Section>
          );
        }
        if (section === "projects") {
          return (
            <Section key={section} title={labels[section]}>
              {document.projects
                .filter((item) => item.included)
                .map((item) => (
                  <div key={item.id} className="break-inside-avoid">
                    {item.title.trim() && (
                      <p className="font-bold">{item.title.trim()}</p>
                    )}
                    {item.description.trim() && (
                      <p>{item.description.trim()}</p>
                    )}
                    {item.period.trim() && (
                      <p className="text-[11px] italic text-neutral-600">
                        {item.period.trim()}
                      </p>
                    )}
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {item.bullets.map((bullet, index) => (
                        <li key={`${item.id}-${index}`}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </Section>
          );
        }
        if (section === "certifications") {
          return (
            <Section key={section} title={labels[section]}>
              {document.certifications
                .filter((item) => item.included)
                .map((item) => (
                  <p key={item.id}>
                    {[item.name, item.issuer, item.date]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                ))}
            </Section>
          );
        }
        if (section === "languages") {
          return (
            <Section key={section} title={labels[section]}>
              <p>
                {document.languages
                  .filter((item) => item.included)
                  .map((item) =>
                    [item.name, item.level].filter(Boolean).join(" — "),
                  )
                  .join("  ·  ")}
              </p>
            </Section>
          );
        }
        return (
          <Section key={section} title={labels[section]}>
            {document.otherEngagements
              .filter((item) => item.included)
              .map((item) => (
                <div key={item.id} className="break-inside-avoid">
                  <p className="font-bold">
                    {[item.role, item.organization].filter(Boolean).join(" — ")}
                  </p>
                  <p className="text-[11px] italic text-neutral-600">
                    {[item.startDate, item.endDate]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {item.bullets.map((bullet, index) => (
                      <li key={`${item.id}-${index}`}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </Section>
        );
      })}
    </article>
  );
}
