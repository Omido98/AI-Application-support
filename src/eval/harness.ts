/**
 * Tiny offline eval harness.
 *
 * Every eval case registers itself as a normal Vitest test. Inside a case,
 * `run.check(...)` records one pass/fail result instead of throwing
 * immediately, so one bad prompt invariant does not hide the rest of the
 * case. The case fails at the end if any of its checks failed, and a single
 * report is printed after the suite finishes.
 *
 * This is deliberately small: no network, no API keys, no Tauri, no timers.
 */
import { afterAll, expect, it } from "vitest";

export interface CheckRecord {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

interface CaseRecord {
  readonly name: string;
  readonly checks: readonly CheckRecord[];
  readonly durationMs: number;
}

const caseRecords: CaseRecord[] = [];

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim();
}

function preview(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > 48 ? `"${oneLine.slice(0, 45)}..."` : `"${oneLine}"`;
}

/** One eval case, with its own pass/fail check collector. */
export class EvalRun {
  private readonly records: CheckRecord[] = [];

  check(name: string, assertion: () => void): void {
    try {
      assertion();
      this.records.push({ name, ok: true });
    } catch (error) {
      this.records.push({
        name,
        ok: false,
        detail: errorText(error),
      });
    }
  }

  contains(
    text: string,
    needle: string,
    label = `includes ${preview(needle)}`,
  ): void {
    this.check(label, () => expect(text).toContain(needle));
  }

  omits(
    text: string,
    needle: string,
    label = `omits ${preview(needle)}`,
  ): void {
    this.check(label, () => expect(text).not.toContain(needle));
  }

  equals(actual: unknown, expected: unknown, label: string): void {
    this.check(label, () => expect(actual).toEqual(expected));
  }

  isTrue(value: boolean, label: string): void {
    this.check(label, () => expect(value).toBe(true));
  }

  isFalse(value: boolean, label: string): void {
    this.check(label, () => expect(value).toBe(false));
  }

  matches(text: string, pattern: RegExp, label: string): void {
    this.check(label, () => expect(text).toMatch(pattern));
  }

  get checks(): readonly CheckRecord[] {
    return this.records;
  }
}

/** Register one deterministic eval case. */
export function evalCase(name: string, body: (run: EvalRun) => void): void {
  it(name, () => {
    const startedAt = performance.now();
    const run = new EvalRun();
    let crash: unknown;

    try {
      body(run);
    } catch (error) {
      // A crash is still recorded as a failed check so the report is complete.
      crash = error;
      run.check("case completed without throwing", () => {
        throw error;
      });
    }

    caseRecords.push({
      name,
      checks: [...run.checks],
      durationMs: performance.now() - startedAt,
    });

    if (crash) throw crash;

    const failed = run.checks.filter((check) => !check.ok);
    if (failed.length > 0) {
      const details = failed
        .map((check) => `  - ${check.name}: ${check.detail ?? "failed"}`)
        .join("\n");
      throw new Error(
        `${failed.length}/${run.checks.length} checks failed in ${name}\n${details}`,
      );
    }
  });
}

/**
 * Print one concise report after the eval suite. Checks are the scored unit;
 * cases are shown so a reader can see which prompt area regressed.
 */
export function installEvalSummary(
  title = "Offline prompt & response-parsing eval",
): void {
  afterAll(() => {
    const allChecks = caseRecords.flatMap((record) => record.checks);
    const totalChecks = allChecks.length;
    const passedChecks = allChecks.filter((check) => check.ok).length;
    const failedChecks = totalChecks - passedChecks;
    const failedCases = caseRecords.filter((record) =>
      record.checks.some((check) => !check.ok),
    ).length;
    const passedCases = caseRecords.length - failedCases;
    const score =
      totalChecks === 0
        ? "n/a"
        : `${((passedChecks / totalChecks) * 100).toFixed(1)}%`;
    const elapsedMs = caseRecords.reduce(
      (sum, record) => sum + record.durationMs,
      0,
    );
    const width = 70;
    const lines = [
      "",
      "=".repeat(width),
      ` ${title}`,
      "=".repeat(width),
      ...caseRecords.map((record) => {
        const passed = record.checks.filter((check) => check.ok).length;
        const status = passed === record.checks.length ? "PASS" : "FAIL";
        return `${status}  ${record.name.padEnd(44)} ${passed}/${record.checks.length} checks`;
      }),
      "-".repeat(width),
      ` Checks: ${passedChecks} passed, ${failedChecks} failed, ${totalChecks} total`,
      ` Score:  ${score}`,
      ` Cases:  ${passedCases} passed, ${failedCases} failed`,
      ` Time:   ${(elapsedMs / 1000).toFixed(2)}s`,
      "=".repeat(width),
      "",
    ];
    console.log(lines.join("\n"));
  });
}
