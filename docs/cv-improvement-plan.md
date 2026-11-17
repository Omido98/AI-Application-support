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

- Split `CvBuilder` into memoized section components so a keystroke does not
  rerender every section.
- Cache the profile fingerprint and rendered profile context.
- Precompute job keywords once per application/version, not on every edit.
- Debounce ATS/grounding analysis rather than running it on each keystroke.
- Send a compact rewrite context (target section + relevant role/project +
  job summary/keywords) instead of the full profile JSON.
- Add a lightweight editor performance budget to the perf suite (typing a
  long CV, section switching, preview toggle).

**Why:** AI latency dominates generation, but the editor architecture is
currently O(all sections) per keystroke and every rewrite repeats full-profile
context.

## Phase 5 — Language, page fit and editor UX (v1.14.0)

- Explicit language-change flow: headings only vs regenerate content in the
  new language; warn about mixed-language exports.
- Page-count estimate or page-break markers in preview, with an overflow
  warning when the CV likely exceeds two pages.
- Collapsible entries, sticky section navigation and clearer AI action
  placement.
- Rewrite presets: shorter, more senior, more technical, stronger verbs,
  requirement-focused (truthfully).
- Show an “AI-assisted” marker per rewritten section.

**Why:** these are the most visible day-to-day friction points after the
review workflow.

## Phase 6 — ATS depth (v1.15.0)

- Multi-word phrase matching and a curated synonym map.
- Group missing keywords by requirement; distinguish must-have from
  nice-to-have.
- Highlight matched terms in the preview.
- Keep the deterministic no-auto-insert rule.

**Why:** current exact unigram matching is honest but noisy; requirement-level
guidance is more actionable.

## Phase 7 — Output polish (v1.16.0)

- Second ATS-safe visual template.
- PDF export alongside DOCX.
- Optional “use recent chat details” as an explicit context source.
- Cover-letter/CV narrative consistency helpers.

**Why:** lower priority than trust, performance and language/page fit; these
are output options rather than workflow blockers.

## Cross-cutting rules

- Never let generated content replace a user-edited section without an
  explicit accept action.
- Never automatically insert a missing keyword or credential.
- Keep DOCX rendering and ATS analysis deterministic and local.
- Every phase must keep backup/prune/reset coverage and axe/browser tests
  green.
- Review the roadmap after each release; do not bundle phases blindly.
