# Live provider eval

The offline suite (`npm run eval`) is the CI gate: deterministic, free, and
network-free. The live eval is a **manual, opt-in quality check** against a real
model. It sends the real prompts from the app and scores the answers
lexically.

## Running it

```bash
# PowerShell
$env:EVAL_API_KEY="..."
$env:EVAL_BASE_URL="https://opencode.ai/zen/v1"
$env:EVAL_MODEL="deepseek-v4-flash-free"
npm run eval:live

# bash
EVAL_API_KEY=... EVAL_BASE_URL=https://opencode.ai/zen/v1 \
EVAL_MODEL=deepseek-v4-flash-free npm run eval:live
```

- `EVAL_BASE_URL` is any OpenAI-compatible base URL; `/chat/completions` is
  appended when missing.
- `EVAL_API_KEY` and `EVAL_MODEL` are required; without all three variables the
  suite is skipped (which is what CI and normal `npm test` do).
- Keys must never be committed. Put them in the shell only, not in a tracked
  `.env`.
- The run makes three chat requests. Check your provider's pricing before
  running it repeatedly.

## What is scored

| Case         | Scored by                                                                                                 | Passing bar                                      |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Cover letter | required-fact grounding (company/role/name), anti-slop phrase count, coverage of six requirement keywords | grounding ≥ 0.5, anti-slop ≥ 0.6, coverage ≥ 0.4 |
| Draft review | parsed reviewer verdict                                                                                   | a parseable PASS/REVISE (score > 0.5)            |
| De-slop      | banned phrases before vs after                                                                            | count decreases and anti-slop ≥ 0.8              |

Scorers are deliberately lexical and live in
[`src/eval/liveScoring.ts`](../src/eval/liveScoring.ts); their unit tests are
part of the offline suite. They catch regressions in grounding and slop, not
prose quality — read the outputs.

The cases reuse [`src/eval/fixtures.ts`](../src/eval/fixtures.ts), so the same
Northstar Labs application and Astrid Nyholm profile drive both the offline and
live evals.

## Recorded results

| Date       | Model | Result                                                                                                                                   |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | —     | Not run: no `EVAL_*` credentials in the development environment. The offline suite passed 215/215 checks and the live suite was skipped. |

Add a row after a real run (model, scores, and any notable failure). Do not gate
CI on live results; a provider outage or model drift must not block releases.

## Limits

- Only OpenAI-compatible endpoints are supported; Anthropic's Messages API is
  not exercised live.
- Temperature is fixed at 0.2 and output at 800 tokens, so the run is
  repeatable but not identical.
- No human review is replaced: a high lexical score can still be a bad letter.
