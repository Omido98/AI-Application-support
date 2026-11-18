# Code review fixes and performance plan

- Status: Phases 0-4 implemented and tested on 2026-11-18; Phases 5-9 pending.
- Created: 2026-11-18
- Note: the item-level checkboxes below are the original plan. The "Quick
  progress table" and "Implementation notes" at the end record what is actually
  done.
- Source: full code review of the chat, CV builder, tracker, profile, persistence,
  Rust backend and test setup on 2026-11-18.
- Scope: correctness bugs first, then performance, then smaller UX/security
  polish. No feature redesign and no storage-format migration.

This document is the implementation checklist for that review. Work top to
bottom unless a dependency says otherwise. Each item has an priority, the files
it touches, the change to make, the tests to add, and a "done when" definition.
Tick the checkbox only when the tests for that item pass.

---

## How to use this plan

1. Read "Guardrails" and "Decisions already made" before touching code.
2. Do Phase 0 and record the baseline. Do not skip it; several findings are
   only visible with a browser or a Rust test.
3. Implement one item at a time. Keep each item as its own commit when possible,
   so a regression can be bisected.
4. For every item, run the narrow tests named in the item, then the full
   verification matrix at the end of the document.
5. Update this file as you go: tick boxes, add a short note with the commit
   hash, and record any deviation from the plan.

Suggested branch name: `fix/review-fixes` (branched from `main`).

```bash
git checkout main
git pull --ff-only
git checkout -b fix/review-fixes
```

---

## Guardrails

- **Never release from this work.** No version bump, no tag, no publishing, no
  merging the PR, unless the user explicitly asks. This follows `AGENTS.md`.
- Keep the on-disk JSON format and file names unchanged. No SQLite, no schema
  version bump, no migration.
- Keep backups readable and crash-safe. Do not weaken the atomic write /
  `.bak` / quarantine behavior.
- Keep the app's privacy and security guarantees: API keys stay in the OS
  keychain when available, no new network calls, no new Tauri permissions,
  no new webview filesystem access.
- Do not change user-facing prompt text (chat system prompts, review/verify
  prompts) in this plan. These fixes are code-behavior fixes, not prompt
  experiments. If a prompt change becomes necessary, run `npm run eval` and
  update `docs/` first.
- Preserve the deliberate tradeoffs documented in `docs/data-storage.md` and
  `docs/cv-builder.md` (plain JSON, debounced saves, pretty-printed files,
  approximate page estimate). The plan only removes avoidable work inside
  those tradeoffs.
- Prefer small, shared utilities over copy-pasted fixes. Two findings here
  (FIX-01 and FIX-02) are the same class and must share one buffered editor.

---

## Decisions already made

These are the recommended choices. Do not re-open them unless implementation
reveals a concrete blocker.

1. **Buffered editors keep raw text.** The component owns the raw string while
   mounted/focused. Normalization happens in the consumer's `onCommit`, never
   in the value that is fed back into the textarea. External updates (AI
   rewrite, restore, generation) are adopted only when the field is not
   focused and not dirty.
2. **CV generation proposals live in `cvStore`, keyed by application id.**
   They survive tab/app navigation and cannot be applied to another
   application. Section rewrites stay local to the modal and are aborted on
   unmount.
3. **`CvBuilder` is keyed by application id** (`key={application.id}`). This
   resets local UI state (extra context, language, page size, template,
   rewrite state) when the selection changes.
4. **Backup import validates the applications payload before writing anything.**
   A malformed payload rejects the whole import; it never prunes thread/CV
   files. The safety copy stays as-is.
5. **Chat, profile and application saves are serialized per file.** `flush*`
   waits for in-flight writes. This mirrors the existing `cvStore` promise
   queue.
6. **Client-side pacing is kept only where it plausibly helps.** Remove the
   `pace()` before the first improve request; keep a short delay between
   successive round-trips unless the user later asks to remove all of it.
   Server-side 429 retry in Rust remains the real rate-limit protection.
7. **No new npm runtime dependencies for the core fixes.** `jszip` is already
   present transitively and may be used for a DOCX test; add it to
   `devDependencies` only if the test needs an explicit import. If a
   virtualization library is ever needed for PERF-01, stop and ask the user
   first; prefer a small manual windowing approach or defer virtualization.
8. **Streaming SSE keeps reading after `finish_reason`** until `[DONE]`/EOF,
   with a short grace timeout, so trailing usage chunks are captured.

---

## Phase 0: Baseline and safety net

### BASE-01 Record the starting state

- [ ] Run and record the results of:
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run format:check`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `npm run test:e2e` (this starts the Vite dev server)
  - `npm run test:a11y`
  - `npm run test:perf`
- [ ] Manually reproduce the two typing bugs (FIX-01, FIX-02) in the dev app
  (`npm run tauri dev`) or browser mode (`npm run dev`) and note the exact
  steps. This confirms the tests in Phase 1 fail before the fix and pass after.
- [ ] Manually reproduce the CV cross-application issue if a provider is
  configured (FIX-03). If no provider is available, rely on the store/unit
  test described there.
- [ ] Record the baseline long-task numbers from `npm run test:perf` attachments
  for the existing chat and CV tests.

**Done when:** the baseline is written into this plan's "Baseline results"
section and there are no unrelated failing tests blocking the work.

### BASE-02 Extend the e2e seed helper for the new tests

The current `e2e/support/seed.ts` hardcodes a minimal profile and supports only
applications, settings and one chat thread. Extend it (defaults unchanged) with:

- [ ] an optional `profile` override or `profilePatch` so tests can seed work
  experience/achievements;
- [ ] an optional `cvDocuments: Record<applicationId, CvDocument>` map that
  writes `aas:cv_<id>.json` (and optionally `aas:cv_history_<id>.json`);
- [ ] an optional thread `messages` override or `messageCount` for the
  long-thread perf test;
- [ ] keep the existing exports and defaults stable so current specs do not
  change.

**Done when:** the Phase 1, Phase 2 and Phase 5 tests can be written without
duplicating localStorage setup code.

### Baseline results

Fill in after running:

| Check | Result | Notes |
| --- | --- | --- |
| `npm test` | PASS | Baseline 441 passed / 3 skipped; after Phases 1-3: 457 passed / 3 skipped. |
| `npx tsc --noEmit` | PASS | |
| `npm run lint` | PASS | |
| `cargo test` | PASS | 41 passed with a short `CARGO_TARGET_DIR` (`%TEMP%\aas-cargo-target`). The default target path triggers a local MSVC `cl.exe` D8050 failure while compiling `ring`; that is a toolchain/path issue, not a test failure. See implementation notes. |
| `npm run test:e2e` | PASS | Baseline 19 passed; after new tests: 26 passed. |
| `npm run test:a11y` | PASS | 13 passed. |
| `npm run test:perf` | PASS | 5 passed; chat/CV numbers unchanged within noise. |

---

## Phase 1: Text-corruption bugs (do first, highest user impact)

Both items are the same root cause: a controlled editor is fed a normalized
value while the user is typing. Build one correct shared component and use it
in both places.

### FIX-01 [P1] Fix per-keystroke normalization in profile achievement editors

**Problem.** `WorkExperienceSection` renders the achievement textarea from a
normalized array and normalizes on every change:

- `src/components/profile/WorkExperienceSection.tsx:421-434`
- `src/components/profile/WorkExperienceSection.tsx:505-523`

Typing a space at the end of the current line removes it immediately; pressing
Enter creates an empty line that `filter(Boolean)` drops. Sequential typing
cannot produce spaces or new lines. Pasted text appears to work, which hides
the bug.

**Implementation.**

1. Build the shared buffered editor from FIX-02 first (it lands in
   `src/components/common/BufferedTextarea.tsx` and must pass its regression
   test). Do not fix this field with a one-off local workaround.
2. Replace both achievement textareas with the shared component:
   - `value={(we.achievements ?? []).join("\n")}`
   - `onCommit={(value) => updateWorkExperience(we.id, { achievements: lines(value) })}`
   - Same for `proj.achievements` in the project block.
3. Keep the committed representation normalized (trimmed, no empty lines) so
   `profile.json` stays clean. The editor keeps the raw text while focused.
4. Reuse the existing `lines()` helper (move it to a shared module if needed;
   see FIX-02).
5. Check `OtherEngagementsSection` and `EducationSection` for the same pattern;
   they use per-row inputs today, so no change should be needed, but verify.

**Tests (Playwright, `e2e/app.spec.ts` or a new `e2e/editing.spec.ts`).**

- Seed a profile with one work experience and open the Profile tab.
- Type `Reduced ` (trailing space), wait 400 ms, type `costs by 30%.`, then
  assert the textarea value is exactly `Reduced costs by 30%.`.
- Press Enter, wait 400 ms, type `Second bullet`, and assert the value contains
  two lines separated by `\n`.
- Blur, then inspect browser-mode storage (`aas:profile.json`) and assert the
  achievement array equals the two trimmed lines.
- Repeat a shortened version for a project achievement field.

**Done when.**

- [ ] The Playwright test fails on the current code and passes after the fix.
- [ ] Spaces, trailing spaces between words, and Enter-separated lines survive
  normal typing speed with pauses up to 400 ms.
- [ ] The persisted profile contains the clean normalized array after blur.
- [ ] Existing profile/CV tests still pass.

### FIX-02 [P1] Fix CV list editors re-adopting normalized text

**Problem.** `BufferedTextarea` adopts the parent `value` whenever the local
draft differs and `dirtyRef` is false:

- `src/components/cv/BufferedTextarea.tsx:42-47`
- `src/components/cv/BufferedTextarea.tsx:87-92`

CV consumers normalize list text on commit (`lines()` in
`src/components/cv/CvBuilder.tsx:98-103`). After the 300 ms commit, the parent
echoes the normalized value, the adoption effect replaces the live draft, and
the next keystroke concatenates. Examples:

- Trailing space removed: `React ` + pause + `Native` becomes `ReactNative`.
- Newline removed: bullet 1 + Enter + pause + bullet 2 becomes one bullet.
- Affected fields: skills (`CvBuilder.tsx:1020-1024`), experience bullets
  (`:1145-1151`), project/education/other bullets, and any other
  `BufferedTextarea` fed by a normalized array.

**Implementation.**

1. Move `BufferedTextarea` to a shared location:
   `src/components/common/BufferedTextarea.tsx` (create `common/`). Update
   imports in `CvBuilder.tsx` and any tests. Do not import a CV component from
   the profile code.
2. Change the component contract/implementation:
   - Keep `draft` and `draftRef` as the raw user text.
   - Commit on blur, on a debounce (default 300 ms), and via
     `registerPendingEditFlush` on close/export/backup (existing behavior).
   - Never adopt `value` while the textarea is focused or `dirtyRef` is true.
   - When not focused and not dirty, adopt an external `value` only if it is
     genuinely external. Track the last committed value and ignore the echo of
     the same commit (normalization can make `value !== draft`).
   - On unmount, flush a dirty draft first, then do not adopt.
3. Add a shared `BufferedInput` in the same directory for short text inputs
   (used later by PERF-02). It uses the same adoption rules.
4. Keep the component API mostly compatible (`value`, `onCommit`, `delayMs`,
   textarea props) so the CV change is mechanical.

**Tests.**

- Unit-test the pure parts (if extracted): commit scheduling, `dirty` handling,
  and "external value is ignored while focused".
- Playwright regression test (CV):
  - Seed a profile with one work experience.
  - Open Application -> Tailored CV -> Start from profile.
  - Focus the bullets textarea, type `Led `, wait 400 ms, type `migration.`,
    assert the value is `Led migration.`.
  - Press Enter, wait 400 ms, type `Second bullet`, assert two lines.
  - Blur, reload the app, reopen the CV, assert both bullets persisted
    separately.
- Playwright regression test (skills): type two skills with a pause after
  Enter; assert two lines.
- Add a test that an external change while the field is **not** focused is
  adopted (simulate an AI rewrite by updating the store/document, then assert
  the textarea shows the new value).

**Done when.**

- [ ] Both Playwright tests fail before the fix and pass after.
- [ ] Pausing mid-line or after Enter never changes the editor text.
- [ ] AI rewrite/regeneration still replaces the field when it is not being
  edited.
- [ ] Existing CV tests pass.

---

## Phase 2: CV async correctness

### FIX-03 [P1] Scope CV generation proposals to the application and survive navigation

**Problem.** `CvBuilder` is reused across applications (no `key`) and stores
the generation proposal in component state:

- `src/components/tabs/ApplicationTab.tsx:771-772`
- `src/components/cv/CvBuilder.tsx:322-351` (app-change effect)
- `src/components/cv/CvBuilder.tsx:542-559` (`handleGenerate`)
- `src/components/cv/CvBuilder.tsx:561-576` (`handleAcceptGenerated`)

If the user switches applications while generation runs, the result is shown
over the new application and `applyGeneratedCv(application.id, proposal)` can
write app A's CV into app B. If the user switches tabs or to Details, the
component unmounts and the finished proposal is lost (tokens still spent).

Additionally, switching to an app with no saved CV keeps the previous app's
`extraContext`, language, page size and template (`CvBuilder.tsx:287-292`,
`:336-342`, `:344-351`). Those values are used by "Start from profile" and
"Generate" for the new application.

**Implementation.**

1. Add a per-application generation proposal to `cvStore`:
   ```ts
   interface CvState {
     generationProposals: Record<string, CvDocument>;
     // ...
   }
   ```
   The proposal document must include the application id (see next step) or be
   keyed by it; keying is sufficient.
2. Either:
   - change `generateCv` to store the proposal itself and return `boolean`
     (preferred), or
   - keep `generateCv` returning the document and add
     `setGenerationProposal(appId, doc)` / `clearGenerationProposal(appId)`
     calls in the component.
   The store approach is preferred because the proposal must survive an
   unmount and is shared by the dialog.
3. In `generateCv`, after `generateCvDocument` resolves and before storing,
   check `controller.signal.aborted` and `deletedApplications`. Do not store a
   proposal for an aborted/deleted request.
4. In `CvBuilder`, subscribe to `generationProposals[application.id]`; the
   review dialog is open when that proposal exists. `handleAcceptGenerated`
   must:
   - verify the proposal belongs to the current application (defensive check);
   - call `applyGeneratedCv(application.id, proposal)`;
   - clear the proposal from the store after success/discard.
5. Add `key={application.id}` to `<CvBuilder application={selected} />`.
   This resets `extraContext`, `language`, `pageSize`, `template`,
   `generationProposal`, `rewrite*` and `previousDocument` on app change.
   Initialize `language` from the new `application` via `useState(() =>
   inferLanguage(application))` (already the case).
6. Keep section rewrites local (modal), but abort the rewrite request on
   unmount and on application change. Add a cleanup effect:
   ```ts
   useEffect(() => () => rewriteController.current?.abort(), []);
   ```
   Also clear `rewriteTarget`/`rewriteProposal` on app change if the component
   is not keyed (the key makes this unnecessary, but keep it defensive).
7. When an application is deleted, remove `generationProposals[appId]` in
   `deleteCv` (and in `resetCache`).
8. Update `cvStore.test.ts` and any component tests for the new API.

**Tests.**

- Store test: mock `generateCvDocument` to return doc A for app A and doc B for
  app B; call `generateCv` for both; assert `generationProposals` is keyed
  correctly. Delete app A and assert its proposal is removed.
- Store test: abort app A's controller while generating; assert no proposal is
  stored.
- Component/integration test (can be Vitest with a shallow render or a
  Playwright test if a fake provider is available):
  - Start generation for app A, switch selection to app B before it resolves,
    resolve A's generation, assert B does not show/open A's proposal.
  - Switch back to A and assert A's proposal is available.
- Playwright (no provider): seed `cv_<A>.json` with `extraContext: "Only for
  A"`; switch to app B (no CV); assert the extra-context field is empty and the
  language is inferred from B, not retained from A.
- Rewrite: start a rewrite, switch tabs, assert no late result is applied and
  no unhandled rejection appears.

**Done when.**

- [ ] Generation proposals are keyed by app and survive tab/app switches.
- [ ] Accepting always writes to the app that requested it (property test or
  store test).
- [ ] Switching to an app with no CV shows clean local state.
- [ ] Section rewrites cannot land in another application.
- [ ] `deleteCv` clears any pending proposal.

### FIX-04 [P2] Respect Stop/cancellation in CV generation

**Problem.** `generateCvDocument` never checks `response.stopped` or the abort
signal after `sendMessage` (`src/utils/cvGeneration.ts:303-340`), unlike
`rewriteCvSection` (`src/utils/cvRewrite.ts:297-301`, `:324-328`). A stopped
stream with parseable partial JSON can be returned as a document, and the
repair path runs against an aborted signal.

**Implementation.**

1. After each `sendMessage` in `generateCvDocument`, if `signal?.aborted` or
   `response.stopped`, throw an error with `name = "AbortError"` (mirror
   `rewriteCvSection`).
2. In `cvStore.generateCv`, after the promise resolves, if
   `controller.signal.aborted`, return `null` and do not store a proposal.
3. Do not treat `stopped` as a generation error message in the UI; the user
   cancelled, so keep the previous CV and close the pending state.
4. Add tests in `cvGeneration.test.ts`:
   - `sendMessage` mocked to return `{ content: '{"summary":"x"}', stopped:
     true }`; assert rejection with `AbortError` and that `sendMessage` is
     called only once.
   - An aborted signal before the call; assert no network call and no
     second/repair call.
5. Add a store test that an aborted generate action leaves
   `generationProposals` empty.

**Done when.**

- [ ] Stop never opens/applies a generated CV.
- [ ] A stopped response never triggers a repair round.
- [ ] Existing generation tests pass.

### FIX-05 [P2] Make "Remove from CV" recoverable

**Problem.** Removing an entry immediately filters it out
(`src/components/cv/CvBuilder.tsx:243-251`, `:1059-1066`, and the other
`onDelete` call sites). Manual CV edits are never snapshotted; only AI
regeneration/rewrite/restore are. A misclick permanently deletes hand-written
bullets.

**Implementation.**

1. Before deleting an entry/section, call
   `await snapshotCurrent(application.id, "Before removing <label>")`, then
   apply the deletion. Do this for experience, education, projects,
   certifications, languages and other engagements.
2. Keep the `include` checkbox as the non-destructive option.
3. Alternatively add an inline undo, but the Versions snapshot is already
   implemented and tested; prefer it.
4. Ensure the snapshot label is short and unique enough to recognize.

**Tests.**

- `cvStore.test.ts`: `snapshotCurrent` prepends and caps at 5 (already tested);
  add a test that removing through the helper creates a snapshot.
- Playwright: open a CV with a role, click Remove, open Versions, restore the
  snapshot, assert the role returns.

**Done when.**

- [ ] Every destructive CV entry removal is reversible from Versions.
- [ ] No extra snapshot is created for include/exclude toggles.

---

## Phase 3: Persistence and data safety

### FIX-06 [P1] Delete the only application must still offer Undo

**Problem.** The undo toast is only in the main layout, but deleting the last
application returns the empty state first:

- `src/components/tabs/ApplicationTab.tsx:424-445` (empty state return)
- `src/components/tabs/ApplicationTab.tsx:1338-1350` (undo toast)
- `src/components/tabs/ApplicationTab.tsx:251-268` (delete/timer)

The timer still finalizes, deleting the chat thread and CV with no way back.

**Implementation.**

1. Extract the toast into a small `DeleteUndoToast` component (or a
   `const undoToast = ...` fragment).
2. Render it in both the empty-state branch and the normal branch. The empty
   state should still offer "Add your first application" and the Undo toast.
3. Keep the `deletedApp` state and the 8-second timer as they are.
4. Consider disabling "Add your first application" while a deletion is
   pending? No: adding is independent and must not cancel the undo. Keep both
   available.
5. Ensure the toast is not clipped by the empty-state layout (fixed bottom-right
   is already used).

**Tests (Playwright).**

- Seed one application, open it, delete it, confirm. Assert the empty state and
  the "Deleted X" toast are both visible.
- Click Undo. Assert the application returns, is selected, and the chat/CV
  files were not deleted (browser mode: check localStorage keys still exist if
  seeded).
- Delete again, wait 8.5 s, assert the toast disappears and the finalization
  runs (chat/CV file removed in browser mode).
- Re-run the existing multi-application delete test.

**Done when.**

- [ ] Deleting the last app shows Undo and it works.
- [ ] Expiry still finalizes all data.

### FIX-07 [P1] Reuse `finalizeDeletion` in the unmount cleanup

**Problem.** The unmount cleanup for a pending undo window deletes only the
draft and chat thread
(`src/components/tabs/ApplicationTab.tsx:282-292`), while `finalizeDeletion`
also deletes the CV (`:245-249`). Switching tabs or closing the window within
8 seconds leaves `cv_<id>.json` and `cv_history_<id>.json` on disk forever.
It also bypasses `deleteCv`'s save-queue/abort handling
(`src/stores/cvStore.ts:337-371`).

**Implementation.**

1. Extract one `finalizeDeletion(app)` function (already exists as a local
   function; keep it stable with `useCallback` or a ref if needed).
2. Call it from both the timer and the unmount cleanup.
3. Make the cleanup synchronous in the effect return: `if (app) void
   finalizeDeletion(app)`.
4. Ensure no duplicate deletion if both the timer and cleanup run (the timer is
   cleared first; `deleteCv` is idempotent enough, but guard with a
   `finalizedRef` set of ids if needed).
5. Verify `deleteCv` is safe when the CV is not loaded (it is: it clears timers
   and deletes files).

**Tests.**

- Playwright: seed an app with a CV draft (`aas:cv_<id>.json` and
  `aas:cv_history_<id>.json`), delete it, immediately switch to another tab,
  wait for finalization; assert the CV storage keys are gone.
- Unit/store test: `deleteCv` waits for a queued save and then deletes
  (`cvStore.test.ts` already has queue tests; extend if needed).

**Done when.**

- [ ] No deletion path leaves CV files behind.
- [ ] No duplicate/racy delete errors.

### FIX-08 [P1] Serialize saves per file and make flush await in-flight writes

**Problem.** Saves are fire-and-forget and not serialized:

- Chat: `saveThread` starts an `invoke` with no queue
  (`src/stores/chatStore.ts:320-338`); `flushChatSave` only waits for timers
  (`:352-362`); `clearMessages` deletes the file while a save may be in flight
  (`:677-703`).
- Application/profile: the debounced write is not tracked; `flush*` returns
  true if the timer already fired, even if the write is still running
  (`src/stores/applicationStore.ts:15-41`,
  `src/stores/profileStore.ts:24-66`).
- Drafts: same pattern (`src/stores/chatStore.ts:368-410`).

Consequences: a delete/reset can be undone by a late save; the close flush can
return before the disk write completes; two writes to the same file can
complete out of order.

**Implementation.**

1. Add a generic per-file save queue utility, e.g.
   `src/utils/saveQueue.ts`:
   ```ts
   export function createSaveQueue<T>(save: (value: T) => Promise<boolean>) {
     let tail: Promise<boolean> = Promise.resolve(true);
     let last: Promise<boolean> = tail;
     return {
       enqueue(value: T): Promise<boolean> { ... },
       whenIdle(): Promise<boolean> { return last; },
     };
   }
   ```
   Or implement the pattern locally (cvStore is the reference:
   `src/stores/cvStore.ts:61-68`, `:170-207`).
2. Chat: one queue per thread (`Map<threadId, chain>`), plus one for drafts.
   - `saveThread` enqueues.
   - `flushChatSave` awaits both pending timers and `whenIdle()` for every
     thread that has a queue.
   - `clearMessages` cancels the timer, marks the thread as deleted (a
     `deletedThreads` set, like `deletedApplications` in cvStore), waits for
     the queue, then calls `deleteFile`. Late saves check the set and no-op.
   - `deleteApplicationThread` should use the same path.
   - `resetThreadCache` invalidates all queues and sets the deleted markers.
3. Application/profile/drafts: track the in-flight write promise. `flush*`
   awaits it. The debounce timer should only schedule if there is no queued
   write for that file; serialize writes so the newest state wins (each queued
   write reads the current store state when it runs, like `writeSnapshot`, or
   the queue dedupes to the latest payload).
4. `flushAllSaves` remains a single `Promise.all` over the per-store flushes.
5. Keep failure reporting unchanged: a failed write returns false and the
   storage banner reports it.

**Tests.**

- `chatStore.test.ts` (has a `deferred` helper):
  - Mock `saveJson` to a deferred promise, trigger a message save, call
    `flushChatSave` before resolving; assert it does not resolve until the save
    resolves.
  - Trigger `clearMessages` while a save is in flight; resolve the save; assert
    `deleteFile` is called after the save and no later `saveJson` recreates the
    thread.
  - Two rapid updates: assert saves are serialized (second save starts after
    the first resolves) and the final file contains the latest messages.
- Add a small `applicationStore`/`profileStore` test (new file) for flush
  awaiting an in-flight write.
- Playwright: close/reload immediately after typing? Browser mode uses
  localStorage synchronously, so not a good test; keep this at the unit level.

**Done when.**

- [ ] No save can run concurrently with another save for the same file.
- [ ] Delete/reset wins over an in-flight save.
- [ ] `flush*` resolves only after all writes settle.
- [ ] Failure semantics are unchanged.

### FIX-09 [P1] Reject malformed application payloads in backup imports

**Problem.** `parseBackupBundle` validates the envelope but not the
applications payload (`src/utils/backup.ts:106-122`). `restoredApplicationIds`
returns `[]` when `applications.json` is present but not
`{applications: [...]}` (`:126-144`), and restore then prunes every chat/CV
file (`:159-179`). The UI can still show the pre-import applications because
`loadApplications` reports the bad file and leaves state unchanged, making the
damage non-obvious. The safety copy exists but has no restore UI.

**Implementation.**

1. Add `validateBackupApplications(bundle)` in `backup.ts`:
   - If `applications.json` is absent: fall back to the current file, as today.
     If the current file cannot be read/normalized, abort the import instead of
     pruning.
   - If present: require a record with an `applications` array. Require each
     entry to be a record with a string `id` matching
     `/^[a-zA-Z0-9-]+$/` (the same rule used for chat file names). Reject with
     a clear error on any violation. Do not silently repair ids on import,
     because new ids would orphan the corresponding thread files.
   - Return the validated ids.
2. Throw an `Error` with a user-facing message from `restoreBackupBundle`
   before any `saveJson`/prune call. `SettingsDialog.handleImport` already
   catches and shows `Import failed: ...`; keep that path.
3. Use the validated ids for `draftsForApplications` and both prune calls.
4. Update `parseBackupBundle` if useful, but the important check is before
   writing. A malformed bundle should not overwrite `applications.json` either.
5. Add a guard so prune is never called with an empty array unless the bundle
   explicitly has a valid empty applications array. If `applications.json` is
   absent and the current file is missing, treat the current ids as empty; that
   is a valid empty state and pruning is correct.
6. Tests in `src/utils/__tests__/backup.test.ts`:
   - `files: { "applications.json": {} }` → rejects, `saveJson` not called,
     `prune*` not called.
   - `applications: "nope"` → rejects.
   - An entry with a missing/invalid id → rejects.
   - `applications: []` → accepted and prunes all (intentional).
   - Existing valid restore tests still pass.
7. Update the import confirmation/error copy only if needed; no format version
   bump.

**Done when.**

- [ ] A malformed backup changes nothing on disk.
- [ ] A valid backup restores and prunes exactly as before.
- [ ] The safety copy remains available for support.

---

## Phase 4: Provider streaming correctness

### FIX-10 [P1] Stop dropping trailing usage chunks in the SSE reader

**Problem.** `StreamAccumulator` marks the OpenAI stream finished on
`finish_reason` (`src-tauri/src/lib.rs:481-484`) and `stream_sse` returns at the
next blank line (`:709-723`). OpenAI's documented `stream_options:
{ include_usage: true }` sends a usage-only chunk after `finish_reason`, before
`[DONE]`, so usage is always null for spec-compliant OpenAI streams. The chat
message usage/cost display and CV `lastUsage` are then missing. The accumulator
test feeds usage after `[DONE]` manually (`:2577-2626`), which masks the bug.

**Implementation.**

1. Refactor the consume loop for testability:
   - Extract the stream-consuming function to accept a byte stream
     (`impl Stream<Item = Result<Bytes, E>>` or a generic async reader) and an
     event callback (`impl FnMut(ChatStreamEvent) -> Result<(), String>`),
     instead of taking `reqwest::Response` and `Channel` directly.
   - `stream_sse` becomes a thin wrapper that calls it with
     `response.bytes_stream()` and a closure that sends on the channel.
2. Change the termination logic:
   - Do not return immediately when `acc.is_finished()`.
   - Continue reading until `[DONE]`, EOF, cancellation, or a short grace
     timeout after the first finished signal (e.g. 2–3 seconds). The grace
     protects against a provider that keeps the connection open without
     closing it.
   - For Anthropic, `message_stop` is terminal and usage arrives before it;
     the same loop can still apply, but do not delay unnecessarily.
   - Keep the 120 s idle timeout for the normal (not-yet-finished) phase.
3. Ensure `Done` is emitted exactly once, after the trailing events are
   consumed, with the accumulated usage.
4. Keep cancellation behavior: a cancelled token aborts the read and still
   emits the partial `Done`/`Error` path as today.
5. Tests (`#[tokio::test]` in `lib.rs`):
   - Feed SSE bytes: a content delta, a `finish_reason` chunk, a usage-only
     chunk, `[DONE]`. Assert the callback receives `Delta` then `Done` with
     `usage.input_tokens`/`output_tokens` set.
   - Feed a tool-call stream and assert the assembled tool call is preserved.
   - Feed a trailing event without a final blank line and assert it is not
     lost.
   - Feed an aborted/cancelled stream and assert partial content is delivered.
6. Optionally add a frontend test for `extractUsage` with the new shape; it
   already handles input/output tokens.

**Done when.**

- [ ] OpenAI-compatible streams report usage and cost per message again.
- [ ] The new Rust test fails before the fix and passes after.
- [ ] No regression in tool-call assembly, cancellation, or idle timeout.

---

## Phase 5: Chat performance

### PERF-01 [P1] Stop re-rendering the whole thread on every streamed delta and keystroke

**Problem.** `ChatTab` subscribes to the whole thread object
(`src/components/tabs/ChatTab.tsx:59-61`), which changes on every
`streamingText` update and every draft keystroke. That re-renders
`MessageList`, which has no `React.memo` (there is no `React.memo` in `src`),
maps every message (`src/components/chat/MessageList.tsx:653`), runs
`formatMessageTime` per row (`:657`), and re-parses Markdown per row
(`:731`). `react-markdown` creates a processor and runs a full parse on every
render (`src/components/chat/Markdown.tsx:53-63`). `StreamingBubble` already
subscribes to `streamingText` separately
(`src/components/chat/StreamingBubble.tsx:50-56`), but the parent subscription
defeats that isolation.

**Implementation (in order of value).**

1. Split the `ChatTab` selectors:
   - `activeThreadId`
   - `threadLoaded` (primitive)
   - `isSending` (primitive)
   - `inputValue` (only if the composer stays in ChatTab)
   - `messages` via `selectActiveMessages` (already stable)
   Do not select the whole `ThreadState`. A `streamingText` change must not
   re-render ChatTab.
2. Memoize the message list:
   - `export default memo(MessageList)`.
   - Stabilize `onStart`, `onResend`, `onRegenerate` in ChatTab with
     `useCallback`; pass stable callbacks.
   - Extract a `MessageRow` component and `memo` it with primitive props
     (`message`, `isLast`, `isSending`, `anyActionPending`, `feedback`, etc.).
   - Memoize `Markdown` (`memo(function Markdown({ children })...)`) so a
     parent re-render with the same string does not re-parse.
   - Move `formatMessageTime` into a memoized `MessageTime` component or cache
     the formatted values in a `useMemo` keyed by `messages`.
3. If keystroke lag remains, move the composer draft out of `ChatTab` (or into
   a dedicated `ChatComposer` that subscribes to the draft). `ChatTab` can read
   the draft on send from the store. Do this only after profiling step 1–2;
   it is a larger refactor.
4. Virtualize the list for long threads only if the measurements still show a
   problem. Prefer a small manual windowing approach; if a library such as
   `@tanstack/react-virtual` is desired, ask the user first (see decision 7).
   Keep scroll behavior (`stickyToBottom`, scroll memory) working either way.
5. Streaming Markdown: if profiling shows the single `StreamingBubble` parse is
   costly for long replies, render plain text while streaming and parse
   Markdown once at completion, or throttle the Markdown update to ~100 ms.
   The rAF batcher already limits updates to one per frame; this step is
   optional.

**Tests.**

- `e2e/perf.spec.ts`: add a long-thread streaming test:
  - Seed a thread with ~60 messages (extend `e2e/support/seed.ts` with a
    `messageCount` option).
  - Push 300 deltas through the real store/batcher from the page context (the
    existing test already does this).
  - Collect `longtask` entries and total elapsed; assert a generous ceiling
    (for example, longest task < 300 ms and fewer than N long tasks). Record
    the baseline before the fix so the threshold is meaningful.
- Add a static guard: a Vitest test that `selectActiveMessages` returns the
  same array identity across a `streamingText` update (this exists implicitly
  in the store; add it to `chatStore.test.ts` to prevent regressions).
- Manual check: with a long thread, the message text should not flicker or
  lose selection while streaming, and scrolling should remain smooth.

**Done when.**

- [ ] A streamed delta re-renders only the streaming bubble (verified by a
  render counter in a temporary debug build or the long-task test).
- [ ] A composer keystroke does not re-render the message list.
- [ ] Long-thread streaming stays inside the perf budget.
- [ ] Scroll-to-bottom, copy/save feedback, refine menu, and error banners keep
  working.

### PERF-02 [P2] Keep the chat token readout off the keystroke path

**Problem.** `contextUsage` depends on `inputValue` and rebuilds the full
system prompt (once or twice, including the whole profile and job description)
and refits the whole history on every keystroke
(`src/components/tabs/ChatTab.tsx:101-150`).

**Implementation.**

1. Compute the base prompt token count in a memo keyed on the actual prompt
   inputs (application fields, profile, prompt mode/custom prompt, summary).
   Do not key on the whole `profile` object unless necessary; a profile
   fingerprint or the specific fields is enough.
2. Compute the draft contribution separately:
   `reserved = basePromptTokens + summaryTokens + estimateTokens(draft)`.
   `estimateTokens` is linear in length, so it is cheap.
3. Run `fitHistoryToBudget` only when `messages`, `inputBudget`, or
   `basePromptTokens` change, not when the draft changes. The draft only
   shifts `reservedTokens`; either pass a cheap adjusted reserved value or
   accept a 150–250 ms debounce on the readout.
4. Use `useDeferredValue(inputValue)` for the readout if you want to keep the
   live value in the textarea without forcing a synchronous re-computation.
5. Keep the displayed estimate accurate enough for the warning threshold; the
   exact tokenizer is not available anyway.
6. Add a pure helper (e.g. `estimateContextUsage`) in `contextBudget.ts` and
   unit-test it with fixed prompt/message inputs, including the summary case.

**Done when.**

- [ ] Typing a character does not rebuild the system prompt.
- [ ] The readout still shows the same values (within the estimate) after a
  short delay.
- [ ] The "older messages omitted" count and summary trigger still work.

---

## Phase 6: CV performance

### PERF-03 [P2] Buffer short CV inputs so typing does not re-render the whole builder

**Problem.** Every plain `<Input>` in `CvBuilder` writes to the store on each
character (`src/components/cv/CvBuilder.tsx:1926-2046`, `:1076-1084`, and the
other section inputs). `updateCv` replaces the document
(`src/stores/cvStore.ts:222-232`), re-rendering the whole editor, the sidebar
and `analyzeCoverLetterConsistency` (`CvBuilder.tsx:394-400`). Collapsed
sections still render their children (`hidden` only, `:188`).

**Implementation.**

1. Use the shared `BufferedInput` from FIX-02 for text-like fields:
   contact details, headline, role, company, location, start/end date text,
   skill entries, certification names, language names, etc.
   Leave `select`, checkbox, and date inputs immediate if their change events
   are discrete and cheap.
2. This makes store updates happen on blur/pause, not per keystroke. The
   debounced save then mirrors real edits rather than every character.
3. Split the expensive sidebar panels into memoized components:
   `AtsPanel`, `GroundingPanel`, `ConsistencyPanel`, `PagePanel`, each taking
   the report/estimate as a prop and rendering only when it changes.
4. Debounce `analyzeCoverLetterConsistency` on the deferred document (same
   250 ms pattern as ATS/grounding) or fold it into `analyzeCvDocument`.
5. Render collapsed section bodies conditionally (`{!collapsed && children}`)
   instead of `hidden`, once the buffered inputs are in place. This reduces
   render work for long CVs.
6. Optional: split `CvBuilder` into per-section components with their own
   store selectors. This is a larger refactor; do it only if the measured
   typing cost is still high after steps 1–5.

**Tests.**

- Extend `e2e/perf.spec.ts` "CV typing stays responsive" to type into a
  plain field (role/company) in a long CV, not only the summary. Keep the
  existing generous ceilings; record before/after long-task counts.
- Playwright correctness: type a role with a pause, assert the value is not
  lost and persists after reload.
- Unit test the buffered input's commit/adoption behavior if extracted as a
  hook.

**Done when.**

- [ ] Typing in short CV fields does not update the store per character.
- [ ] Typing a long CV stays inside the perf budget.
- [ ] AI rewrite/restore external updates still appear in the fields.
- [ ] Collapsed sections do not mount their inputs.

### PERF-04 [P3] Cache CV audit lookups and text extraction

**Problem.**

- `synonymsFor` linearly scans and re-normalizes the synonym groups for every
  term (`src/utils/cvAts.ts:372-378`).
- `analyzeCvGrounding` re-tokenizes the full serialized profile JSON even
  though `getCvProfileContext` caches the string
  (`src/utils/cvGrounding.ts:297-300`).
- `analyzeCoverLetterConsistency` re-spreads the CV word set for every summary
  term (`src/utils/cvConsistency.ts:138-146`).
- `cvPlainText(document)` is rebuilt by both the ATS and consistency passes.

**Implementation.**

1. Precompute a normalized synonym lookup at module scope:
   `Map<normalized term, string[]>`. Keep `SYNONYM_GROUPS` for display.
2. Add a cached token set to `CvProfileContext`:
   - Move `CLAIM_STOPWORDS` and `contentTokens` to a shared
     `src/utils/textTokens.ts` to avoid a circular import.
   - `getCvProfileContext` returns `{ json, numbers, tokens }`.
   - `claimWarnings` uses `context.tokens`.
3. Cache `cvPlainText(document)` in a `WeakMap<CvDocument, string>` exported
   from `cvAts.ts`, and use it in the consistency pass.
4. Replace `[...cvWords].some(...)` with a loop over the set and an early
   return.
5. In `CvBuilder`, run consistency on the deferred/analysis document (see
   PERF-03).
6. Tests:
   - Existing `cvAts.test.ts`, `cvGrounding.test.ts`, `cvConsistency.test.ts`
     must pass unchanged.
   - Add a test asserting the synonym lookup returns the same variants as
     `SYNONYM_GROUPS`.
   - Add a test that the cached tokens equal the old `contentTokens` output for
     a sample profile.

**Done when.**

- [ ] Audit output is byte-for-byte identical on the existing fixtures.
- [ ] The profile JSON is tokenized once per profile object, not per analysis.
- [ ] No measurable regression in the CV unit tests.

### PERF-05 [P3] Avoid rebuilding the fit matrix for unrelated edits

**Problem.** `ApplicationTab` recomputes sort/filter/counts/search on every
`applications` change (`src/components/tabs/ApplicationTab.tsx:341-404`).
`FitMatrixCard` keys its memo on the whole `application` object
(`src/components/tracker/FitMatrixCard.tsx:36-55`), so typing in Notes or
Company Research rebuilds all profile evidence sets and re-splits the posting
(`src/utils/fitMatrix.ts:130-168`, `:204-230`).

**Implementation.**

1. Change `FitMatrixCard`'s memo dependencies to the fields it uses:
   `application.requirements`, `application.jobDescription`,
   `application.id`, and the six profile arrays. `buildFitMatrix` can keep the
   whole app object; the memo just needs narrow deps.
2. Memoize `profileEvidence` separately (keyed on the six arrays) and pass it
   into `buildFitMatrix` as an optional parameter, or memoize inside the card.
3. Memoize the sidebar row component with `memo` and primitive props
   (`app`, `isSelected`, `chip text/class`). Untouched applications keep their
   object identity in `updateApplication`, so only the edited row re-renders.
4. Use `BufferedTextarea` for the long application fields (Job Description,
   Requirements, Company Research, Notes). This removes the per-keystroke
   store updates that cause the whole pipeline to rerun.
5. Add a `WeakMap` haystack cache in `applicationSearchText` so the expensive
   lowercased concatenation is reused for untouched applications.
6. Tests:
   - Unit test `buildFitMatrix` with a spy/counter? Add a pure test that
     changing an unrelated field does not change the matrix output (already
     true), and rely on the perf e2e for the render cost.
   - Extend `e2e/perf.spec.ts` with a tracker typing test: seed ~100
     applications with a long job description, type into Notes with pauses,
     assert long-task ceilings.
   - Playwright: search still matches all fields after caching.

**Done when.**

- [ ] Typing in Notes/Company Research does not re-render the fit matrix or
  unrelated sidebar rows.
- [ ] Search results and sorting are unchanged.
- [ ] Tracker typing stays inside the perf budget.

### PERF-06 [P2] Stop paying 700 ms before the first improve request

**Problem.** `runImprovePipeline` calls `pace()` before the first review
(`src/utils/api.ts:516`), and before every revise/verify/deslop step
(`:553`, `:585`, `:613`). Quick improve pays ~1.4 s of dead time; deep improve
pays several seconds. The Rust client already retries 429 with
`Retry-After`/backoff.

**Implementation.**

1. Remove the initial `await pace()` before `options.onStep?.("review")`.
2. Keep a short delay between successive provider calls for now (deliberate
   rate-limit safety), unless the user asks to remove it. Consider making the
   delay adaptive: 0 normally, retry with delay only after a 429. If that is
   more work than desired, at minimum remove the pre-first-call delay.
3. Check the tests: `api.test.ts` uses `setPaceDelayMs(0)` in most tests; add a
   test that the first request starts immediately (assert `reviewDraft` is
   called before any timer advance, or spy on `pace`).
4. No prompt changes.

**Done when.**

- [ ] Quick improve starts the first request immediately.
- [ ] Rate-limit behavior still works (unit tests and manual 429 path).
- [ ] Existing improve tests pass.

### PERF-07 [P2] Run independent tool calls in parallel

**Problem.** Tool calls from one model round execute sequentially
(`src/utils/api.ts:1039-1046` for OpenAI, `:1334-1342` for Anthropic). Two
independent searches/fetches take the sum of their latencies.

**Implementation.**

1. Collect the tool results with `Promise.all` over the calls, preserving the
   order of `history.push`/`toolContext.push` by index.
2. Limit concurrency (for example 3) with a tiny helper if a model can request
   many calls; most rounds have one or two.
3. Keep `onToolActivity` behavior: it may fire for each call; the UI shows the
   latest. If that is confusing, show a combined status, but do not block the
   calls.
4. Tool result formatting and error strings must stay identical.
5. Tests in `api.test.ts`:
   - Mock two `zen_web_search`/`zen_fetch_page` invokes with deferred
     promises; assert both start before either resolves (parallel) and the
     history order is call order.
   - Assert a failed call still returns its error string and the loop
     continues.
6. Cancellation: ensure `Promise.all` rejects/returns when the signal aborts;
   the existing `invoke` calls are not cancellable, but the loop checks the
   signal before continuing. Accept that in-flight tools finish; note it.

**Done when.**

- [ ] Two independent tool calls overlap in time.
- [ ] Appended tool results keep the model's call order.
- [ ] Cancellation still stops the loop before the next round.

### PERF-08 [P3] Remove the extra read/parse on every JSON save

**Problem.** `save_bytes_atomic` validates the existing file by calling
`read_json_file` before rotating it (`src-tauri/src/lib.rs:1619-1637`,
`:1441-1462`). Every debounced save does an extra full read and
`serde_json` parse of the old bytes.

**Implementation.**

1. Add a managed `DataFileCache`/`KnownGoodFiles` state to the Tauri app:
   `Arc<Mutex<HashMap<PathBuf, FileStamp>>>`, where `FileStamp` is
   `{ len: u64, modified: Option<SystemTime> }`.
2. On a successful `load_data_file` (valid or recovered) and after a
   successful `save_bytes_atomic`, record the stamp of the current file.
3. Before rotating in `save_bytes_atomic`, check the stamp:
   - If the path is known good and its current metadata matches the stamp,
     skip `read_json_file` and rotate directly.
   - If it is missing or the stamp does not match (external edit, unknown
     file), keep the current validation/quarantine path.
4. On any save failure or quarantine, remove the path from the cache.
5. Pass the known-good information into the blocking save closure (avoid
   holding a mutex across the whole write; copy the stamp or use the state
   only for the decision).
6. Add Rust tests:
   - Save twice with a valid cache stamp; assert the second save succeeds and
     the backup contains version 1.
   - Corrupt the main file and change its size/mtime; assert the validation
     path still quarantines it and preserves the good backup.
   - A missing cache entry behaves exactly as today.
7. Measure the before/after on a generated 1 MB payload if desired; record it
   in this plan.

**Risks.** External edits to app data while the app is running would not be
detected for files in the cache. The app is single-instance and the data files
are not meant to be edited live; document this in the code comment. The
metadata check plus a cache clear on load keeps the common path safe.

**Done when.**

- [ ] A normal save no longer reads/parses the old file.
- [ ] Corruption recovery and backup rotation tests still pass.
- [ ] The cache is invalidated on any failure/quarantine.

---

## Phase 7: Smaller correctness, UX and security fixes

### FIX-11 [P2] Count recent chat messages correctly

**Problem.** `block.split("\n").length - 1` counts the end marker
(`src/components/cv/CvBuilder.tsx:613`); 8 messages are reported as 9.

**Implementation.**

1. Change `buildChatContextBlock` in `src/utils/cvChatContext.ts` to return
   `{ block: string, count: number }`, or add
   `countChatContextMessages(block)` that subtracts 2. Prefer the structured
   return.
2. Update the one call site in `CvBuilder` and the tests in
   `src/utils/__tests__/cvChatContext.test.ts`.
3. Ensure the block text itself is unchanged.

**Done when.**

- [ ] The status message reports the exact number of included messages.
- [ ] `mergeChatContext`/`stripChatContext` remain unchanged.

### FIX-12 [P2] Do not show deadline/follow-up chips for archived applications

**Problem.** `dueChip` runs for every row regardless of status
(`src/components/tabs/ApplicationTab.tsx:594-598`), and in the detail header
(`:407-412`). Archived applications (offer/rejected) keep permanently red
"overdue" chips, inconsistent with notifications, analytics and calendar
export.

**Implementation.**

1. Skip `dueChip` when `isArchivedStatus(app.status)` in the sidebar row and
   the detail header (and anywhere else the chip is rendered).
2. Keep the status badge/priority visible.
3. Optionally show a neutral "Closed" indicator instead of a chip; do not add
   new information without a design decision.
4. Test:
   - Playwright: seed a rejected app with a deadline in the past, open
     Archive, assert "overdue" is not visible; switch to an active app with
     the same deadline and assert the chip is visible.
   - Unit test the chip helper if it is moved to a util.

**Done when.**

- [ ] Archive rows and archived detail headers never show due chips.
- [ ] Active rows behave exactly as before.

### FIX-13 [P3] Refresh Overview dates at midnight

**Problem.** `stats` is memoized on `[applications]` only
(`src/components/tabs/OverviewTab.tsx:99-106`), while `computePipelineStats`
uses `new Date()` internally (`src/utils/pipelineStats.ts:431-445`). Leaving
the tab open overnight keeps yesterday's "Today"/"in 2d" values and calendar
count.

**Implementation.**

1. Add a `useNowAtMidnight()` hook (or a small `useNow` in `src/hooks/`):
   - Initial `new Date()`.
   - Schedule a timeout to the next local midnight + 1 s, then reschedule.
   - Also update on `visibilitychange`/`focus` when the day changed.
   - Clear the timer on unmount.
2. In `OverviewTab`, pass `now` to `computePipelineStats(applications, now)`
   and `countCalendarEvents(applications, now)`, and include `now` in the memo
   deps.
3. Do the same for the deadline/follow-up chips in the tracker if it is cheap:
   a shared `useNowAtMidnight` state at the tab level and pass `now` into
   `dueChip` (currently it creates `new Date()` per call). This also reduces
   repeated `Date` creation.
4. Unit test the helper `msUntilNextLocalMidnight` (pure) and the stats with an
   injected `now` (already supported).
5. Playwright: not practical to wait for midnight; rely on the unit tests and a
   short manual check with a fake clock if desired.

**Done when.**

- [ ] The Overview updates once after midnight without a reload.
- [ ] No per-second timers; the hook schedules one wake-up per day plus
  focus events.

### FIX-14 [P3] Neutralize spreadsheet formulas in CSV exports

**Problem.** `escapeCsv` implements RFC 4180 quoting but does not prevent cells
starting with `=`, `+`, `-` or `@` from being evaluated when opened in
Excel/LibreOffice (`src/utils/csv.ts:43-74`, and `src/utils/timeline.ts`).

**Implementation.**

1. Add a `neutralizeCsvFormula(value)` step before quoting:
   - If the value starts with `=`, `+`, `-`, `@`, tab or CR, prefix a single
     apostrophe (`'`).
   - Consider only doing this for text columns, or accept the tradeoff for
     negative numbers (the profile/salary fields are text anyway). Document
     the choice.
2. Apply it in `escapeCsv` so both `applicationsToCsv` and the timeline export
   benefit. If timeline builds rows without `escapeCsv`, update it.
3. Tests in `src/utils/__tests__/csv.test.ts`:
   - `=1+1` → `'=1+1`
   - `+SUM(A1)` → `'+SUM(A1)`
   - `-5` → `'-5` (documented behavior)
   - Values with commas/quotes/newlines keep RFC 4180 quoting.
   - Normal text is unchanged.
4. No change to the exported column/order.

**Done when.**

- [ ] Formula-leading cells are neutralized in both CSV exports.
- [ ] Round-trip parsing of normal values is unchanged.

### FIX-15 [P3] Make DOCX line spacing explicit

**Problem.** `renderCvDocx` passes `lineHeight = linePt * 20` as `spacing.line`
without `lineRule` (`src/utils/cvDocx.ts:72`, `:304-311`). OOXML defaults
`lineRule` to `auto`, where `line` is 240ths of a line, so 264 is interpreted
as 1.1 lines rather than the 13.2 pt used by the preview and PDF. That can
change the PDF/DOCX page count near a boundary.

**Implementation.**

1. Import `LineRuleType` from `docx` and set
   `lineRule: LineRuleType.EXACT` wherever a `line` value is supplied (the
   default document style and any paragraph-level overrides).
2. Verify no other spacing entries rely on the default; search for
   `spacing:` in `cvDocx.ts`.
3. Test in `cvDocx.test.ts`:
   - Unzip the generated DOCX with `jszip` (add it to `devDependencies` if
     needed) and assert `word/styles.xml` contains
     `w:line="264"` and `w:lineRule="exact"` for the default style.
   - Keep the existing mammoth text-extraction tests.
4. Re-check `estimateCvPages` against a known long CV; document the remaining
   unavoidable differences (Word vs PDF font metrics) in
   `docs/cv-builder.md`.

**Done when.**

- [ ] DOCX spacing matches the intended exact line height.
- [ ] Preview/PDF/DOCX page estimates are closer for boundary cases.
- [ ] Export tests pass.

---

## Phase 8: Lower-priority performance and hygiene

These are small and optional if earlier phases consume the time budget. Do them
after the P1/P2 items.

### PERF-09 [P4] Reuse the throwaway HTTP client across fetch redirects

`zen_fetch_page` builds a new `reqwest::Client` for every hop
(`src-tauri/src/lib.rs:1120-1139`). The pinning requirement means the client
must be per resolved host, but a redirect chain within the same host/port can
reuse one. Implement a local map of `(host, port) -> reqwest::Client` for the
duration of one `zen_fetch_page` call, or build the client once and rebuild only
when the host changes. Keep the SSRF checks and `resolve_to_addrs` pinning.
There is no practical unit test; verify manually with a redirecting public URL
or a local test server (not trivial here).

### PERF-10 [P4] Reuse calendar event computation

`countCalendarEvents` calls `getCalendarEvents` and returns its length
(`src/utils/calendarExport.ts:100-105`); the Overview calls it separately from
the stats pass. Either return the count from a shared memo or add a cheap count
function that does not sort. Low value; do it only while touching the file for
FIX-13.

### PERF-11 [P4] Investigate binary export IPC

`exportCvDocx`/`exportCvPdf` convert `Uint8Array` to a number array with
`Array.from` (`src/utils/cvDocx.ts:354-357`,
`src/utils/cvPdf.ts:277-280`). A CV PDF is small, so this is not urgent.
Investigate whether Tauri 2's `invoke` can pass `ArrayBuffer`/`Uint8Array`
directly; if not, consider a `Channel`-based upload or a base64 string with a
`base64` crate dependency. Only do this if a real large-export case appears;
otherwise leave it and note the tradeoff.

### PERF-12 [P4] Cache per-message timestamps

Part of PERF-01. If the `MessageRow` memo work already fixes it, no separate
action. Otherwise store the formatted labels in a `WeakMap` or compute them in
one `useMemo` over `messages`.

---

## Phase 9: Final verification, docs and handoff

### VERIFY-01 Full test matrix

Run, in this order, and record the results:

```bash
npx tsc --noEmit
npm run lint
npm run format:check
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
npm run test:a11y
npm run test:perf
npm run eval
```

Notes:

- `npm run eval` is offline and should pass; run it even though prompts are not
  changing, to catch accidental prompt edits.
- `npm run test:perf` is currently non-blocking in CI
  (`docs/quality.md`). Treat a regression in its numbers as a warning and
  record the before/after.
- If a test is flaky, rerun it once and note it; do not silently change a
  threshold.

### VERIFY-02 Manual QA script

With `npm run tauri dev` (or `npm run dev` for the browser-mode checks):

1. Profile: add a work experience, type a multi-word achievement with pauses,
   press Enter, type another bullet, reload the app, verify both bullets.
2. CV: Start from profile, edit a role/company/summary/bullets with pauses,
   preview, export PDF and DOCX, reopen and verify.
3. CV AI: if a provider is configured, start a generation, switch tabs
   mid-generation, return; verify the proposal is still available for the
   correct application and cannot be applied to another.
4. Tracker: create ~20 applications with long descriptions, type in Notes,
   verify the UI stays responsive and search/sort still work.
5. Chat: seed/import a long thread, send a message (real provider if
   available), verify streaming stays smooth, usage/cost shows for an OpenAI
   model, Stop works, and Reset/delete does not resurrect a thread.
6. Backup: export, restore, malformed-payload rejection, safety copy present.
7. Delete the last application, undo, check chat/CV cleanup after expiry.
8. Deadline chips: active vs archived.
9. CSV export: open in a spreadsheet, confirm formula-looking values are
   neutralized.
10. DOCX: open in Word/LibreOffice, compare spacing/page count with the PDF.

### VERIFY-03 Documentation updates

- [ ] `README.md`: update the feature bullets if behavior changed (for example
  "Remove from CV can be restored from Versions"; usage/cost behavior is
  unchanged from the user's perspective once FIX-10 lands).
- [ ] `docs/cv-builder.md`:
  - editing behavior: raw text while typing, commit on blur/pause;
  - removing entries creates a Versions snapshot;
  - generation proposals survive navigation and are scoped to the application;
  - DOCX/PDF pagination note after FIX-15.
- [ ] `docs/data-storage.md`: add a note about the known-good save cache if
  PERF-08 changes the write path, keeping the JSON decision unchanged.
- [ ] `docs/quality.md`: update the performance table with the new
  long-thread/tracker/CV-input checks and the actual results.
- [ ] `docs/exports-and-analytics.md`: mention that archived applications do
  not show due chips (FIX-12) if the doc lists the rule.
- [ ] `docs/deadline-notifications.md`: no behavior change expected; verify.
- [ ] No `package.json` version bump, no `Cargo.toml` version bump, no
  `tauri.conf.json` version bump unless the user asks for a release.

### VERIFY-04 Commit, PR and handoff

- [ ] Commit each phase separately with a message that names the finding ID
  (for example `Fix CV buffered list editor text loss (FIX-02)`).
- [ ] Push the branch: `git push -u origin fix/review-fixes`.
- [ ] Open a PR into `main` and stop. Do not merge, do not tag, do not publish.
  The user tests and merges. This follows `AGENTS.md`.
- [ ] Append a short "Implementation notes" section to this plan with:
  - commits,
  - deviations from the plan,
  - remaining known issues,
  - test results and any flaky checks.

---

## Finding-to-item map

Use this table to confirm every review finding has a home.

| Review finding | Item |
| --- | --- |
| Profile achievements corrupt typed text | FIX-01 |
| CV list editors lose spaces/newlines on autosave | FIX-02 |
| CV generation cross-app apply / lost on navigation | FIX-03 |
| CV generation ignores Stop | FIX-04 |
| CV remove entry is unrecoverable | FIX-05 |
| Delete last app hides Undo | FIX-06 |
| Undo cleanup leaves CV files | FIX-07 |
| Chat/app/profile saves not serialized; flush doesn't await | FIX-08 |
| Backup restore prunes on malformed applications payload | FIX-09 |
| Streaming usage dropped after `finish_reason` | FIX-10 |
| "Added N recent chat messages" off by one | FIX-11 |
| Archived apps show due chips | FIX-12 |
| Overview dates stale at midnight | FIX-13 |
| CSV formula injection | FIX-14 |
| DOCX line spacing missing `lineRule` | FIX-15 |
| Chat re-render/Markdown storm | PERF-01 |
| Chat token counter per keystroke | PERF-02 |
| CV inputs re-render whole builder | PERF-03 |
| CV audit constant-table rebuilds | PERF-04 |
| Tracker fit matrix/sort per keystroke | PERF-05 |
| Improve pipeline 700 ms pre-delay | PERF-06 |
| Tool calls sequential | PERF-07 |
| JSON save re-reads/parses old file | PERF-08 |
| Fetch page client per redirect hop | PERF-09 |
| Calendar count sorts unnecessarily | PERF-10 |
| Export bytes via `Array.from` | PERF-11 |
| Per-message timestamp formatting | PERF-12 |

---

## Test-additions checklist

- [ ] `e2e/editing.spec.ts` (new) or `e2e/app.spec.ts`:
  profile achievement typing with pauses and Enter.
- [ ] Same file: CV bullets/skills typing with pauses and Enter.
- [ ] Same file: external CV update while not focused is adopted.
- [ ] Same file: delete last application -> Undo visible and works.
- [ ] Same file: archived app deadline chip absent.
- [ ] `e2e/perf.spec.ts`: long-thread streaming long-task guard.
- [ ] `e2e/perf.spec.ts`: tracker typing long-task guard.
- [ ] `e2e/perf.spec.ts`: extend CV typing to a plain input field.
- [ ] `src/stores/__tests__/chatStore.test.ts`: flush awaits in-flight save;
  clear/delete wins over an in-flight save; saves serialize.
- [ ] New `src/stores/__tests__/applicationStore.test.ts` (or profile test):
  flush awaits in-flight write.
- [ ] `src/stores/__tests__/cvStore.test.ts`: generation proposal keyed by
  app; abort stores nothing; delete clears proposal; removal snapshot.
- [ ] `src/utils/__tests__/backup.test.ts`: malformed applications payload
  rejected with no writes/prunes; valid empty list still prunes.
- [ ] `src/utils/__tests__/csv.test.ts`: formula neutralization.
- [ ] `src/utils/__tests__/cvDocx.test.ts`: `w:lineRule="exact"` in
  `word/styles.xml`.
- [ ] `src/utils/__tests__/cvChatContext.test.ts`: count is message count, not
  count + 1.
- [ ] `src/utils/__tests__/contextBudget.test.ts` (or new): usage estimate
  helper with prompt/summary/draft.
- [ ] `src-tauri/src/lib.rs` tests: SSE loop consumes trailing usage; tool
  calls preserved; cancellation.
- [ ] `src/utils/__tests__/api.test.ts`: parallel tool calls overlap and
  preserve order; first improve request not delayed.
- [ ] `src/utils/__tests__/cvAts.test.ts`: synonym lookup equivalence.
- [ ] `src/utils/__tests__/cvGrounding.test.ts`: cached profile tokens equal
  the old tokenization.

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| Buffered editor adoption breaks AI rewrite/restore | Add the "external update while not focused" test; keep the dirty/focus guards explicit. |
| Chat memoization causes stale copy/refine feedback | Keep transient UI state (`copiedId`, `openRefineKey`) in the parent and pass only what a row needs; test copy/save/refine/regenerate after the change. |
| CV proposal store refactor breaks existing tests/APIs | Update `cvStore.test.ts` first, keep `applyGeneratedCv` behavior, add the keying test before touching the UI. |
| Save serialization changes flush timing | Keep `flushAllSaves` API and failure semantics; test with deferred mocks. |
| Backup validation rejects previously accepted backups | The previous behavior was unsafe; show a clear error and keep the safety copy. Consider a future "repair backup" tool, not in this plan. |
| SSE loop hangs if a provider never closes the stream | Use a short grace timeout after `finish_reason`; keep the 120 s idle timeout for the normal phase. |
| Known-good save cache misses external edits | Only skip validation when the path was written/loaded by this process and the size/mtime stamp matches; clear on any failure. |
| Parallel tool calls hit provider rate limits | Cap concurrency (3) and keep the Rust 429 retry; tool calls per round are usually 1–2. |
| Long-thread perf tests are flaky on CI | Use generous ceilings and attach the measurements; keep the test non-blocking initially, following `docs/quality.md`. |
| Large CV refactor scope creep | Do the buffered inputs first; split sections only if measurements still show a problem. |

---

## Out of scope

- SQLite/FTS migration (documented decision in `docs/data-storage.md`).
- Changing the backup format/version.
- Changing prompt text or model selection UX.
- A provider-level streaming rewrite (we only adjust the existing SSE reader).
- Windows/macOS code signing, installers, or release automation.
- Redesigning the CV templates or the PDF/DOCX layout beyond the line-spacing
  fix.
- Adding a virtualized list dependency unless PERF-01 measurement requires it.

---

## Quick progress table

Update this as work lands.

| Phase | Items | Status |
| --- | --- | --- |
| 0 | BASE-01, BASE-02 | Baseline captured; seed supports profile/CV overrides (thread message option deferred to Phase 5) |
| 1 | FIX-01, FIX-02 | Done, tested (unit + 5 editing e2e) |
| 2 | FIX-03, FIX-04, FIX-05 | Done, tested (store + generation unit, stale-state/removal e2e) |
| 3 | FIX-06, FIX-07, FIX-08, FIX-09 | Done, tested (store queue tests, deletion/cleanup e2e, backup tests) |
| 4 | FIX-10 | Done, tested (41 Rust tests incl. 3 new SSE tests) |
| 5 | PERF-01, PERF-02 | Not started |
| 6 | PERF-03, PERF-04, PERF-05, PERF-06, PERF-07 | Not started |
| 7 | PERF-08, FIX-11..FIX-15 | Not started |
| 8 | PERF-09..PERF-12 | Not started |
| 9 | VERIFY-01..VERIFY-04 | Automated checks pass; manual QA and PR/handoff pending |

---

## Implementation notes

### 2026-11-18: Phases 0-4

Branch: `fix/review-fixes` (not pushed, no version bump, no release).

Completed:

- **FIX-01/FIX-02**: Added `src/components/common/BufferedTextarea.tsx`,
  `BufferedInput.tsx` and `useBufferedValue.ts`. The editor keeps the raw draft
  while focused; the store value is adopted only when not editing, or on blur
  for an external update. Profile achievements now use the shared editor and
  `src/utils/lines.ts`. The old `src/components/cv/BufferedTextarea.tsx` was
  removed. New e2e coverage in `e2e/editing.spec.ts` (5 tests) proves spaces
  and Enter survive pauses and reloads.
- **FIX-03**: `cvStore` now owns `generationProposals` keyed by application,
  clears them on delete/reset, and aborts correctly when a newer generation
  replaces an older controller. `CvBuilder` reads the proposal from the store,
  `<CvBuilder key={application.id}>` resets local state, and section rewrites
  abort on unmount. New store tests cover keying, cancellation and deletion.
- **FIX-04**: `generateCvDocument` throws `AbortError` for a stopped response
  before parsing or repairing; `cvStore.generateCv` also refuses an aborted
  result. New tests prove a stopped response never triggers a repair request.
- **FIX-05**: Removing any CV entry takes a Versions snapshot first. New e2e
  test removes and restores a role.
- **FIX-06**: The undo toast is rendered in the empty state too. New e2e test
  deletes the only application and undoes it.
- **FIX-07**: The unmount cleanup calls `finalizeDeletion` (chat + CV). New e2e
  test switches tabs during the undo window and asserts all three files are
  removed.
- **FIX-08**: Added `src/utils/saveQueue.ts`. Application, profile, chat thread
  and drafts stores now serialize writes per file and `flush*` awaits in-flight
  writes. `deleteChatThread` waits for a thread's write queue and blocks later
  recreations; `clearMessages` waits and then re-allows a new save. New tests
  cover `saveQueue`, application flush serialization, and chat flush/clear
  races.
- **FIX-09**: `backup.ts` validates the applications payload before writing:
  missing/invalid top-level shape or a non-empty list with zero usable ids
  rejects the import with no writes and no pruning. A missing current
  applications file skips pruning instead of deleting every thread/CV. New
  tests cover the rejection paths and the skip-prune path.
- **FIX-10**: `stream_sse` was split into a generic
  `consume_sse_stream` with a testable callback. It now keeps reading after
  `finish_reason` (3 s grace) until `[DONE]`/EOF, so OpenAI's trailing usage
  chunk is captured. Rust unit tests cover split chunks, one combined chunk,
  and cancellation. Verified: all 41 Rust unit tests pass.

Verification run on 2026-11-18:

- `npm test`: 457 passed, 3 skipped.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass (after formatting one new test).
- `cargo fmt --check`: pass.
- `npm run test:e2e`: 26 passed (19 original + 7 new editing tests).
- `npm run test:a11y`: 13 passed.
- `npm run test:perf`: 5 passed; numbers in the same range as baseline.
- `cargo test`: 41 passed (0 failed). The repository's default target path made
  the local MSVC `cl.exe` fail with `D8050` while compiling `ring`, so the run
  used a short target directory:
  `CARGO_TARGET_DIR=%TEMP%\aas-cargo-target cargo test --manifest-path src-tauri/Cargo.toml`.
  The same three new SSE tests run under `--lib`; `--doc` is empty and exits 0.

Deviations/notes:

- `deletedApplications` is cleared in `cvStore.resetCache` so a reset/import
  does not leave stale delete markers for later ids; `deletedThreads` is also
  cleared on `resetThreadCache` because the import flow flushes first.
- `BufferedInput` is added now but is only used by the later PERF-03 work; no
  CV short fields were converted in this batch (out of scope for Phases 0-4).
- BASE-02's optional thread `messageCount` seed was deferred to Phase 5, where
  the long-thread perf test needs it.
- No release branch/tag/PR was created; the changes are local on the working
  branch.
