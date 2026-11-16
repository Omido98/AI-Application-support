import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/** WCAG 2.1 + 2.2 A/AA. 2.2 adds the 24px target-size rule. */
export const WCAG_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

/**
 * Run axe on the current page (or a dialog subtree) and fail only on
 * serious/critical violations. The full machine-readable result is attached
 * to the report for triage; moderate/minor issues stay visible but do not gate.
 */
export async function scan(
  page: Page,
  testInfo: TestInfo,
  options: { label: string; include?: string },
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]);
  if (options.include) builder = builder.include(options.include);

  const results = await builder.analyze();

  await testInfo.attach(`axe-${options.label}.json`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });

  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    blocking.map(
      (violation) =>
        `${violation.impact} ${violation.id}: ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(" | ")}`,
    ),
    `serious/critical axe violations — ${options.label}`,
  ).toEqual([]);

  // Guard against a scan that silently ran on an empty page.
  expect(
    results.passes.length,
    `axe found no passing rules — ${options.label}`,
  ).toBeGreaterThan(0);
}
