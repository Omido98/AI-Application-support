import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

import { openUrl } from "@tauri-apps/plugin-opener";
import { isSafeExternalUrl, openExternalUrl } from "@/utils/links";

const openUrlMock = openUrl as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  openUrlMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSafeExternalUrl", () => {
  it("allows http, https and mailto", () => {
    expect(isSafeExternalUrl("https://example.com/jobs")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:3000/")).toBe(true);
    expect(isSafeExternalUrl("mailto:jane@example.com")).toBe(true);
  });

  it("rejects executable and local schemes", () => {
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("file:///C:/Windows/win.ini")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
    expect(isSafeExternalUrl("ms-settings:privacy")).toBe(false);
  });

  it("rejects relative links and empty values", () => {
    expect(isSafeExternalUrl("/settings")).toBe(false);
    expect(isSafeExternalUrl("example.com")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
  });
});

describe("openExternalUrl", () => {
  it("uses the opener plugin inside Tauri", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, open: vi.fn() });

    expect(openExternalUrl("https://example.com")).toBe(true);
    await Promise.resolve();

    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
  });

  it("does nothing for an unsafe URL", () => {
    const windowOpen = vi.fn();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, open: windowOpen });

    expect(openExternalUrl("file:///etc/passwd")).toBe(false);
    expect(openUrlMock).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("uses a browser tab outside Tauri", () => {
    const windowOpen = vi.fn();
    vi.stubGlobal("window", { open: windowOpen });

    expect(openExternalUrl("https://example.com")).toBe(true);
    expect(windowOpen).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
