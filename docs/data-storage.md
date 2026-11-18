# Data storage: JSON vs SQLite decision

**Decision: keep plain JSON files with in-memory search.** SQLite/FTS5 is not
justified at the app's current scale.

- Date: 2026-11-16
- Machine: Windows 11 ARM64 laptop (Node 24.18, local dev build)
- Command: `npm run bench:data`
- Code: [`src/utils/dataScale.ts`](../src/utils/dataScale.ts),
  [`src/bench/dataScale.test.ts`](../src/bench/dataScale.test.ts)

## Method

The diagnostic generates synthetic but realistic applications (company,
title, posting text, requirements, research, notes, tags, dates), serializes
the exact `applications.json` payload, then measures the median of five runs
for:

- **Load**: `JSON.parse` plus `normalizeApplicationsPayload` (the same
  defensive normalization the app uses).
- **Search**: the same full-application predicate the tracker uses
  ([`applicationSearch.ts`](../src/utils/applicationSearch.ts)). The benchmark
  query (`typescript`) matches every generated application, so the timing is a
  worst-case full scan rather than an early-exit lookup.

The benchmark is a diagnostic, not a CI performance gate; `npm test` runs it
as a smoke check and prints the report, `npm run bench:data` runs it alone.

## Measurements

| Applications | JSON size | Load (parse + normalize) | Full search | Matches |
| -----------: | --------: | -----------------------: | ----------: | ------: |
|        1,000 |   1.58 MB |                  7.58 ms |     3.33 ms |   1,000 |
|        5,000 |   7.96 MB |                 98.28 ms |    40.55 ms |   5,000 |

A real personal tracker is far below 1,000 applications, so production loads
and searches are single-digit milliseconds. The table shows a cold first run;
warm re-runs are faster (~54 ms load / ~18 ms search at 5,000), so the
conservative numbers are used for the decision.

## Thresholds

Move to SQLite + FTS5 only when **either** holds for real data on a
representative machine:

- more than **5,000 applications**, or
- an in-memory search slower than **250 ms**.

At 5,000 synthetic applications (the count limit) search is ~41 ms and load is
~98 ms: about 6× and 2.5× headroom respectively. Neither limit is met.

Keeping JSON also preserves the current guarantees without new work:

- crash-safe atomic writes with `.bak` rotation and quarantining (Rust);
- user-readable, hand-editable files and simple backup/export;
- one data-directory contract, no migration or schema versioning;
- a per-process "known good" file stamp: after this process writes or loads a
  file, saving it again skips re-reading and re-parsing the old bytes while its
  size/mtime stamp matches. An external edit invalidates the stamp and falls
  back to the full validation path, so the corrupt-main/good-backup guarantee is
  unchanged.

## If the threshold is ever met

Do it as a migration, not a rewrite:

1. Import `applications.json` once into a new `applications.db` (SQLite +
   FTS5), recording a schema version; keep the JSON file as a read-only
   fallback for one release.
2. Keep `backup.json` export/import compatible: export a JSON snapshot from the
   database, and import into the database.
3. Keep the data-directory contract; add the database file rather than
   changing paths.
4. Move the storage commands in `src-tauri/src/lib.rs` behind the same
   frontend wrapper API so stores and tests do not change.
5. Store chats/profile as files until they independently justify a move;
   application search is the first candidate for FTS5.

Re-run `npm run bench:data` and update this document when the decision changes.
