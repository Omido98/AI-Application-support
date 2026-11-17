# CV builder improvement plan

This is the phased follow-up plan after the v1.9.0 CV builder. Phases 1–13 are
implemented. Phase 13's automated acceptance is complete; live-provider
acceptance remains a manual release gate.

## Phase 1 — Reviewable rewrites (v1.10.0)

**Status: implemented in this release.**

- Section rewrites return a proposal instead of replacing immediately.
- Before/after word diff, added/removed counts.
- Grounded-number warnings on the proposed section.
- **Accept**, **Discard**, **Try again** actions.
- Accepted rewrites remain undoable for the session.
- Tests cover proposal construction, section text, apply logic and warnings.

**Why first:** the AI was already good enough to draft; the missing piece was
control over what gets accepted. This phase removes the largest trust gap
without adding model calls.

## Phase 2 — Version history and usage feedback (v1.11.0)

**Status: implemented in this release.**

- Persist the last five CV snapshots per application in
  `cv_history_<id>.json`.
- Snapshots before AI regeneration, accepted rewrites and restores; restore
  snapshots the current CV first.
- Include history in backup/prune/reset paths.
- Show provider token usage and estimated cost for generation and rewrites.
- Add a “last AI action” line in the CV header and a Versions panel.

**Why:** session-only undo does not protect users who close the app; cost
visibility makes repeated section rewrites predictable.

## Phase 3 — Grounding and generation quality (v1.12.0)

**Status: implemented in this release.**

- Deterministically validate generated skills against profile skills and the
  explicit extra context.
- Validate education details/coursework against the referenced profile entry.
- Flag summary and bullet text with very little profile overlap as
  low-evidence claims, alongside unverified numbers.
- Surface all of these as advisory warnings in the Grounding review panel;
  never silently remove or rewrite.
- Improve the generation prompt with compact ATS priorities, relevance rules,
  a two-or-three-role target and a 15-skill cap.
- Add an offline CV grounding eval and prompt tests.

**Why:** source IDs prevent invented employers, but not invented skills or
soft claims. This is the remaining truthfulness gap.

## Phase 4 — Performance and context optimization (v1.13.0)

**Status: implemented in this release.**

- Buffer long text fields locally in the editor and commit on pause/blur, so a
  keystroke no longer rerenders every CV section or writes the whole document.
- Defer ATS/grounding analysis for 250 ms after a committed edit.
- Memoize the profile fingerprint and job-keyword extraction.
- Send a compact rewrite context (target section, relevant role/project/skills,
  truncated job description/keywords) instead of the full profile.
- Add a long-document typing performance budget to the perf suite.
- A full section-component split is intentionally deferred: buffering removed
  the per-keystroke editor-wide render, and the profiler/typing budget shows no
  remaining freeze. Revisit if field count or profile size grows substantially.

**Why:** AI latency dominates generation, but the editor was rerendering all
sections and rerunning every audit on each keystroke. Buffering plus deferred
analysis targets that hot path directly.

## Phase 5 — Language, page fit and editor UX (v1.14.0)

**Status: implemented in this release.**

- Explicit language-change dialog: **Change headings only** vs **Regenerate in
  the new language**, with a persistent mixed-language warning and a
  “Mark body as translated” action.
- Page-count estimate in the editor, overflow guidance above two pages, and
  measured page-break markers in the preview.
- Section navigation and collapsible section cards for long CVs.
- Rewrite presets: shorter, more senior, more technical, stronger verbs and
  requirement-focused.
- AI-assisted markers on sections written or rewritten by AI.
- Collapsible individual entries remain a possible later refinement; section
  collapse and navigation cover the initial long-CV need.

**Why:** these are the most visible day-to-day friction points after the
review workflow.

## Phase 6 — ATS depth (v1.15.0)

**Status: implemented in this release.**

- Multi-word phrase extraction and matching, with longer phrases preferred.
- A curated synonym map (for example JavaScript/JS, accessibility/a11y,
  AWS/Amazon Web Services, design systems/design system).
- Requirement groups parsed from the requirements text, with **Must-have** and
  **Preferred** priority badges and matched/missing terms per group.
- Must-have gap count in the ATS panel.
- Matched terms (including phrase and synonym spellings) highlighted in the
  preview.
- The no-auto-insert, advisory-only rule is unchanged.

**Why:** exact unigram matching was honest but noisy; requirement-level
guidance is more actionable without claiming experience the candidate lacks.

## Phase 7 — Output polish (v1.16.0)

**Status: implemented in this release.**

- Second ATS-safe **Compact** template alongside **Classic**, with matching
  DOCX and preview styling.
- Selectable-text **PDF export** alongside DOCX; both use the same structured
  content and template.
- Explicit **Add recent chat details** action that appends a short, visible
  transcript excerpt to extra context. Chat is never read silently.
- **Cover-letter consistency** panel comparing cover-letter themes and company
  names with the CV.
- Tests for compact DOCX, PDF rendering, chat-context insertion and
  consistency; browser coverage for compact preview and PDF download.

**Why:** output choices and cross-document consistency were the remaining
workflow gaps after trust, performance and ATS depth.

## Phase 8 — Data integrity and save pipeline (v1.17.0)

**Status: implemented in this release.**

The audit found that the plan's cross-cutting promise, “the last edit is never
lost”, was not met.

- Register dirty buffered text inputs and flush them before close, backup,
  export, generation and other destructive/read actions.
- Serialize saves per application with a revision guard. A save that finishes
  after newer edits must not replace the newer in-memory document.
- Make deletion wait for or invalidate in-flight saves so a deleted CV cannot
  be resurrected.
- Resolve the current document from the store at export/generate time instead
  of using a render-time snapshot.
- Add regression tests for save-order races, delete races, dirty-input close
  and registration cleanup.

**Why:** data loss is a P0 defect; further feature work must not proceed on a
save pipeline that can overwrite newer edits.

## Phase 9 — Generation review and provenance (v1.18.0)

**Status: implemented in this release.**

- Full generation now returns a proposal instead of replacing immediately.
- A review dialog shows page/role/skill counts, the generated headline and
  summary, usage, and the full grounding warnings.
- **Accept** snapshots the current CV into Versions and saves the replacement;
  **Discard** keeps the current draft.
- Generated sections receive persistent AI provenance.
- A manual edit to a section clears that section’s AI marker; the marker is
  no longer merely historical.
- Language state is not changed until the generated proposal is accepted.

**Why:** section rewrites were reviewable, but whole-CV generation still
replaced a user-edited draft without an explicit accept step.

## Phase 10 — Layout parity and page accuracy (v1.19.0)

**Status: implemented in this release.**

- One shared layout-metrics source (`cvLayout.ts`) now drives DOCX, PDF,
  preview and page estimates: page size, margins, fonts, line heights and
  section spacing.
- DOCX and PDF both use 36 pt (classic) / 30 pt (compact) margins; the preview
  uses the same points converted to CSS pixels.
- Page estimates are template-aware and use the shared line/section metrics.
- The preview measures its real rendered height, and the overflow warning uses
  the measured count while in Preview.
- PDF tests now extract selectable text (including Swedish characters) and
  verify multi-page output; DOCX text tests cover both templates.

**Why:** the two templates and three outputs previously paginated differently,
so page-fit feedback could contradict the exported file.

## Phase 11 — Performance at scale (v1.20.0)

**Status: implemented in this release.**

- ATS and grounding now run from one document snapshot via
  `analyzeCvDocument` (`cvAnalysis.ts`).
- Number grounding is computed once and shared by both audits.
- Profile JSON/number extraction is cached per profile object
  (`cvProfileContext.ts`); job keywords/phrases are cached per application
  object.
- Added perf budgets for CV section navigation, preview toggling and PDF
  export, in addition to long-document typing.
- The measured editor budgets pass, so the editor was not split into section
  components in this release. Revisit if profile/field counts grow enough to
  miss the budget.

**Why:** buffered typing fixed the measured keystroke regression, but the
analysis path still repeated expensive profile scans and numbers.

## Phase 12 — ATS and consistency quality (v1.21.0)

**Status: implemented in this release.**

- Requirement segmentation now handles semicolons, sentence boundaries,
  multiple requirements, and explicitly negated lines.
- Generic role words are excluded from keyword/highlight noise.
- Match details distinguish **exact**, **phrase** and **synonym** matches; the
  ATS panel shows the wording found in the CV and labels synonym matches.
- Cover-letter consistency now compares actual linked letter content, not only
  the summary, and treats company-matched letters as relevant.
- The appended chat-context block replaces the previous one instead of
  accumulating duplicates.

**Why:** the ATS and consistency layers were useful but still too noisy and
heuristic; this pass makes the evidence easier to interpret.

## Phase 13 — Release hardening and acceptance (v1.21.0)

**Status: automation complete; live-provider acceptance remains a manual
release gate.**

- Native smoke coverage now includes the CV template selector, a restored saved
  version and the headings-only language flow.
- Axe now scans the CV history dialog and cover-letter consistency panel.
- Browser coverage includes PDF text/page output, compact template, chat-context
  deduplication and the latest buffered edit.
- PDF save uses a native dialog and cannot be driven through WebDriver; the
  renderer/browser tests and manual checklist cover the generated file.
- Superseded PRs are closed; old draft releases must not be published.
- Live-provider acceptance is documented in
  `docs/live-provider-acceptance.md` and must be performed before merge.

**Why:** automated tests cover the code paths, but only a real provider run can
validate model output quality.

## Finishing pass (v1.21.1)

- Chat-context re-add now replaces only the generated block and preserves user
  notes outside it, including legacy blocks.
- Undo replacement flushes buffered textarea edits first.
- Generation review shows the actual selected roles, skills, education,
  projects, certifications, languages and other experience before acceptance.
- ATS match types are visible badges; full requirement/term lists can be
  expanded; synonym chips show the job term.
- Cover-letter theme checks ignore greetings, signatures, names, locations and
  common boilerplate, and tolerate simple inflections.
- Docs, the quality matrix and the native/PDF coverage notes reflect the
  current implementation.

## Cross-cutting rules

- Never let generated content replace a user-edited section without an
  explicit accept action.
- Never automatically insert a missing keyword or credential.
- Never let a stale save, delete race or unmounted buffer overwrite newer
  edits.
- Keep DOCX/PDF/preview layout metrics in one source of truth.
- Keep DOCX rendering and ATS analysis deterministic and local.
- Every phase must keep backup/prune/reset coverage and axe/browser tests
  green.
- Review the roadmap after each release; do not bundle phases blindly.
