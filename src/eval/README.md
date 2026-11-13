# Offline prompt & response-parsing eval

A deterministic, Vitest-based eval for the AI prompt and response-parsing
layer. It calls the real builders and parsers directly: no model, no network,
no Tauri, no filesystem writes.

## Run

```sh
npm run eval          # vitest run src/eval
npx tsc --noEmit      # type-check the harness with the app
```

The suite currently runs 15 eval cases / 215 checks in well under a second.
There are no API keys, timers, or network calls involved.

## What it checks

### System prompt builder

- Standard mode: role line, behavior rules, anti-slop rules, the
  untrusted-job-description rule, application context (company, posting,
  language, requirements, research), and the full candidate profile.
- Custom mode: the custom text replaces the standard role/rules, while
  application context and profile are still appended. A blank custom prompt
  falls back to the standard prompt.
- Fit evaluation: the first-message-only block appears only when
  `fitEvaluation` is set, and never in custom mode.
- Conversation summary: the earlier-conversation section appears only when a
  non-empty summary is provided, in both standard and custom modes.
- Phase 2 application fields (location, work mode, salary, source, priority,
  tags, applied date, deadline, follow-up, contact) render when set and are
  omitted entirely when empty.

### Refinement prompt builders

- `buildDeslopPrompt`: anti-slop rules, the exact `No changes needed.` reply,
  output-only instruction, and no chat/web context.
- `buildDraftReviewPrompt`: untrusted-job-text warning, factual-grounding
  audit, research limits, fabrication ban, verdict instructions, application
  context, draft, and profile.
- `buildCoverLetterSummaryPrompt`: full letters plus profile context,
  deduplication rules, uncertain-point retention, and the no-letters branch.
- `buildConversationSummaryPrompt`: transcript rendering, preservation and
  word-limit rules, and the empty-transcript shape.
- `buildDraftRevisionPrompt` and `buildDraftVerifyPrompt`: the key invariants
  that keep the improve loop honest and stateless.

### Response parsers

- `parseReviewVerdict`: trailing/case-insensitive/tabbed/CRLF verdicts, last
  verdict wins, verdict followed by prose, inline false positives, missing and
  empty output, and prefix strings that must not match.
- `parseCvProfileJson`: fenced JSON, plain JSON, a fence without a language
  tag, JSON surrounded by prose, malformed/unterminated JSON, prose without
  JSON, empty output, and non-object JSON. Returned profile data is normalized
  and checked field by field.

### Fixture replay

`model-outputs.ts` saves representative model outputs as strings: a review
report that ends in `VERDICT: REVISE`, a structured suggestion JSON, a CV
profile JSON, and a truncated malformed output. The replay case runs the real
parsers over them and asserts the classification, so parser changes are
visible against realistic text rather than only in isolated unit assertions.

### Context budget

`fitHistoryToBudget` always keeps the newest message (and reports
`overBudget` when it alone cannot fit), trims at a user boundary, reports
dropped counts, respects reserved system/draft tokens, and handles empty
threads. `getContextBudget` reserve/fallback arithmetic is covered as a sanity
case.

## Files

| File | Purpose |
| --- | --- |
| `harness.ts` | `evalCase` registration, per-check pass/fail collection, and the printed score report. |
| `fixtures.ts` | Full Phase 2 `JobApplication`, complete `ProfileData`, draft and conversation fixtures. |
| `modelOutputs.ts` | Saved model output strings used by the replay case. |
| `eval.test.ts` | The eval cases themselves. |

## Report format

Each case fails at the end if any of its checks failed, and all checks still
run so one regression does not hide the rest of a case. After the suite,
`afterAll` prints a summary:

```
 Checks: 215 passed, 0 failed, 215 total
 Score:  100.0%
 Cases:  15 passed, 0 failed
 Time:   0.02s
```

Checks are the scored unit; the case list shows which prompt area regressed.

## Known gap: suggestion JSON

This branch has no production suggestion/JSON extractor; the chat layer only
exports `parseReviewVerdict`, while CV import adds `parseCvProfileJson`.
`SUGGESTION_JSON_OUTPUT` is kept as a replay fixture and is asserted to be
classified as `unknown` by the review parser, so a future suggestion parser
can be added to the replay case with the fixture already in place.
