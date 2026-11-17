# CV builder improvement plan

This is the phased follow-up plan after the v1.9.0 CV builder. Each phase is a
separate release and should be tested before the next one starts.

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

## Cross-cutting rules

- Never let generated content replace a user-edited section without an
  explicit accept action.
- Never automatically insert a missing keyword or credential.
- Keep DOCX rendering and ATS analysis deterministic and local.
- Every phase must keep backup/prune/reset coverage and axe/browser tests
  green.
- Review the roadmap after each release; do not bundle phases blindly.
