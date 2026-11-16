import { expect, test, type Page } from "@playwright/test";
import { openApp, makeApplication } from "./support/seed";

/**
 * Lightweight performance regression checks. They assert counts and generous
 * ceilings, not wall-clock budgets from the dev server (which is unminified
 * and runs React StrictMode).
 */

const application = makeApplication("perf", "Acme Corp", "applied");

async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const perf = {
      longTasks: [] as { start: number; duration: number }[],
      cls: 0,
    };
    (window as unknown as { __perf: typeof perf }).__perf = perf;
    if (typeof PerformanceObserver === "undefined") return;
    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    if (supported.includes("longtask")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          perf.longTasks.push({
            start: entry.startTime,
            duration: entry.duration,
          });
        }
      }).observe({ type: "longtask", buffered: true });
    }
    if (supported.includes("layout-shift")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!shift.hadRecentInput) perf.cls += shift.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    }
  });
}

test("@perf initial render stays inside count budgets", async ({
  page,
}, testInfo) => {
  await instrument(page);
  await openApp(page, {
    applications: [application],
    lastTab: "application",
  });
  await expect(page.getByLabel("Search applications")).toBeVisible();

  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      ),
  );

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    const paint = Object.fromEntries(
      performance
        .getEntriesByType("paint")
        .map((entry) => [entry.name, entry.startTime]),
    );
    const perf = (
      window as unknown as {
        __perf: { longTasks: { duration: number }[]; cls: number };
      }
    ).__perf;
    return {
      fcp: paint["first-contentful-paint"] ?? 0,
      domContentLoaded: navigation.domContentLoadedEventEnd,
      longTaskCount: perf.longTasks.length,
      longestTask: perf.longTasks.reduce(
        (max, task) => Math.max(max, task.duration),
        0,
      ),
      cls: perf.cls,
      nodes: document.getElementsByTagName("*").length,
    };
  });

  await testInfo.attach("initial-render.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  console.log("[perf] initial render", JSON.stringify(metrics));

  expect(metrics.nodes).toBeLessThan(3_000);
  expect(metrics.longTaskCount).toBeLessThanOrEqual(20);
  // Dev-server (unminified, StrictMode) startup varies; catch only a freeze.
  expect(metrics.longestTask).toBeLessThan(1_500);
  expect(metrics.cls).toBeLessThan(0.1);
});

test("@perf tab switching keeps rendering frames", async ({ page }) => {
  await openApp(page, { applications: [application], lastTab: "overview" });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  const frames = await page.evaluate(async () => {
    let count = 0;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        count += 1;
        if (performance.now() - start < 500) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return count;
  });
  expect(frames).toBeGreaterThan(10);

  for (const key of ["Control+1", "Control+2", "Control+3", "Control+4"]) {
    await page.keyboard.press(key);
  }
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
});

test("@perf stream deltas coalesce into very few updates", async ({
  page,
}, testInfo) => {
  await openApp(page, {
    applications: [application],
    lastTab: "chat",
    withChat: true,
  });
  await expect(page.getByPlaceholder(/Type your message/)).toBeVisible();

  const result = await page.evaluate(async () => {
    // The dev server serves the same module instances the app imported.
    const { useChatStore } = await import("/src/stores/chatStore.ts");
    const { createStreamBatcher } = await import("/src/utils/streamBuffer.ts");

    const threadId = useChatStore.getState().activeThreadId;
    if (!threadId) throw new Error("No active chat thread");
    useChatStore.getState().setThreadSending(threadId, true);

    const target = document.querySelector("#tabpanel-main");
    if (!target) throw new Error("Missing tab panel");
    let mutations = 0;
    const observer = new MutationObserver((records) => {
      mutations += records.length;
    });
    observer.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    let flushes = 0;
    const batcher = createStreamBatcher(
      (text) => {
        flushes += 1;
        useChatStore
          .getState()
          .setThreadStreamingText(threadId, (previous) => previous + text);
      },
      (callback) => requestAnimationFrame(callback),
      (handle) => cancelAnimationFrame(handle),
    );

    for (let index = 0; index < 600; index += 1) {
      batcher.push(`token${index} `);
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    batcher.cancel();
    observer.disconnect();
    useChatStore.getState().setThreadStreamingText(threadId, "");
    useChatStore.getState().setThreadSending(threadId, false);

    return { flushes, mutations };
  });

  await testInfo.attach("stream-coalescing.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  console.log("[perf] stream coalescing", JSON.stringify(result));

  expect(result.flushes).toBeLessThanOrEqual(2);
  expect(result.mutations).toBeLessThanOrEqual(100);
});
