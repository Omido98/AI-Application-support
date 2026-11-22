import type { CvDocument } from "@/types/cv";
import { experienceRangeLabel, sortCvRoles } from "@/utils/cvExperience";

function dateRange(start: string, end: string): string {
  return [start, end].filter(Boolean).join(" – ");
}

/**
 * Read-only summary of the generated proposal, shown before it replaces the
 * current CV. This stays compact so the dialog remains scannable.
 */
export default function CvProposalDetails({
  proposal,
}: {
  proposal: CvDocument;
}) {
  const experience = proposal.experience.filter((item) => item.included);
  const roleCount = experience.reduce(
    (sum, item) => sum + item.roles.length,
    0,
  );
  const education = proposal.education.filter((item) => item.included);
  const projects = proposal.projects.filter((item) => item.included);
  const certifications = proposal.certifications.filter(
    (item) => item.included,
  );
  const languages = proposal.languages.filter((item) => item.included);
  const other = proposal.otherEngagements.filter((item) => item.included);

  return (
    <div className="space-y-3 text-xs">
      <section>
        <h4 className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
          Experience ({experience.length}{" "}
          {experience.length === 1 ? "employer" : "employers"} · {roleCount}{" "}
          {roleCount === 1 ? "role" : "roles"})
        </h4>
        {experience.length === 0 ? (
          <p className="mt-1 text-text-muted">No experience.</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {experience.map((item) => (
              <li
                key={item.id}
                className="rounded border border-border bg-field/40 p-2"
              >
                <p className="font-medium text-text-primary">
                  {item.company || "Employer"}
                </p>
                <p className="text-[10px] text-text-muted">
                  {[
                    experienceRangeLabel(item, proposal.language),
                    item.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {item.bullets.length > 0
                    ? ` · ${item.bullets.length} bullet${item.bullets.length === 1 ? "" : "s"}`
                    : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-text-secondary">
                  {sortCvRoles(item.roles)
                    .map((role) => role.title)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.bullets[0] && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-text-secondary">
                    {item.bullets[0]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
          Skills ({proposal.skills.length})
        </h4>
        {proposal.skills.length === 0 ? (
          <p className="mt-1 text-text-muted">No skills selected.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {proposal.skills.map((skill) => (
              <span
                key={skill}
                className="rounded border border-border bg-field px-1.5 py-0.5 text-[10px] text-text-secondary"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </section>

      {(education.length > 0 ||
        projects.length > 0 ||
        certifications.length > 0 ||
        languages.length > 0 ||
        other.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {education.length > 0 && (
            <section>
              <h4 className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Education
              </h4>
              <ul className="mt-1 space-y-1">
                {education.map((item) => (
                  <li key={item.id} className="text-text-secondary">
                    {[item.degree, item.field, item.school]
                      .filter(Boolean)
                      .join(" — ")}
                    {[item.startDate, item.endDate].filter(Boolean).length >
                    0 ? (
                      <span className="block text-[10px] text-text-muted">
                        {dateRange(item.startDate, item.endDate)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {projects.length > 0 && (
            <section>
              <h4 className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Projects
              </h4>
              <ul className="mt-1 space-y-1">
                {projects.map((item) => (
                  <li key={item.id} className="text-text-secondary">
                    {item.title}
                    {item.period ? (
                      <span className="block text-[10px] text-text-muted">
                        {item.period}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {certifications.length > 0 && (
            <section>
              <h4 className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Certifications
              </h4>
              <ul className="mt-1 space-y-1">
                {certifications.map((item) => (
                  <li key={item.id} className="text-text-secondary">
                    {[item.name, item.issuer].filter(Boolean).join(" — ")}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {languages.length > 0 && (
            <section>
              <h4 className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Languages
              </h4>
              <ul className="mt-1 space-y-1">
                {languages.map((item) => (
                  <li key={item.id} className="text-text-secondary">
                    {[item.name, item.level].filter(Boolean).join(" · ")}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {other.length > 0 && (
            <section>
              <h4 className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Other experience
              </h4>
              <ul className="mt-1 space-y-1">
                {other.map((item) => (
                  <li key={item.id} className="text-text-secondary">
                    {[item.role, item.organization].filter(Boolean).join(" — ")}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
