# Accessibility and performance checks

Quality checks added alongside the Phase 5 work. Run them with:

```bash
npm run test:a11y   # axe: WCAG 2.1 + 2.2 A/AA, serious/critical gate
npm run test:perf   # render and streaming-update counts
```

Both run in browser mode against the Vite dev server, reusing the existing
Playwright configuration. The normal `npm run test:e2e` suite excludes them.

## Accessibility (axe)

Playwright 1.65 + `@axe-core/playwright` 4.14, tags `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa`, `wcag22aa` (includes the WCAG 2.2 24px target-size
rule). Only **serious/critical** violations fail; the full axe JSON is attached
to the Playwright report.

Screens scanned (2026-11-16, all passed with zero serious/critical violations):

- Overview, Application, Tailored CV, Cover Letter Developer, Profile tabs
- Settings dialog (including focus trapping)
- Onboarding, first and last step
- Light theme: Application tab and Settings dialog
- Dark theme with the Deep Teal accent (`#0f6e5c`)
- Reduced motion: dialog animation collapses to ≤0.01ms

Also asserted:

- focus can cycle 12 times inside the Settings dialog and Escape returns it to
  the Settings button;
- the shell has exactly four tabs and no nested interactive controls;
- the skip link and `main` landmark are present (the tab panel is now a child of
  the `main` landmark instead of replacing it);
- error banners use `role="alert"`.

### Contrast fixes made by this pass

- The applied accent is shifted toward white (dark theme) or black (light
  theme) until it reaches 4.6:1 against the lightest surface, because the accent
  is also used as a text colour. Button label ink is chosen by contrast ratio
  instead of a luminance threshold. The stored preference is unchanged.
- Light-theme amber text (`text-amber-500` → `text-amber-700 dark:text-amber-400`)
  in the tracker, overview, chat and matrix.
- Light-theme interview/offer chips use amber-800/green-800 labels.
- The chat Stop button uses `text-destructive-foreground` instead of white.

### Not covered by automation

A screen-reader pass (NVDA/VoiceOver), 200% zoom/reflow and Windows High
Contrast remain manual. Axe does not evaluate placeholder contrast and reports
elements over images/gradients as incomplete. Re-run the suite after UI changes
and do a keyboard-only smoke of any new dialog.

## Performance (Playwright counts)

Budgets are counts and generous ceilings, not dev-server wall-clock targets:

| Check                                      | 2026-11-16 result | Budget                    |
| ------------------------------------------ | ----------------- | ------------------------- |
| Initial render DOM nodes                   | 223               | < 3,000                   |
| Startup long tasks                         | 2                 | ≤ 20                      |
| Longest startup task                       | 257 ms            | < 1,500 ms (freeze guard) |
| Cumulative layout shift                    | 0.00013           | < 0.1                     |
| 600 streamed deltas → store flushes        | 1                 | ≤ 2                       |
| 600 streamed deltas → DOM mutation records | 6                 | ≤ 100                     |

The streaming check imports the real `chatStore` and `createStreamBatcher` in
the running Vite page, so it verifies the live-delta isolation rather than a
mock. The tab-switch check requires at least 10 animation frames in 500ms,
which catches a frozen UI.

CI runs `npm run test:a11y` as a blocking step. `npm run test:perf` is
initially non-blocking (`continue-on-error`) because dev-server startup timing
varies between runners; the counts are stable and can be promoted once they
have a clean CI history.
