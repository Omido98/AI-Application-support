import { describe, expect, it, vi } from "vitest";
import {
  flushPendingEdits,
  registerPendingEditFlush,
} from "@/utils/pendingEdits";

describe("pending edits", () => {
  it("flushes registered drafts and stops after unregistering", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerPendingEditFlush(first);
    const unregisterSecond = registerPendingEditFlush(second);

    flushPendingEdits();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unregisterFirst();
    unregisterSecond();
    flushPendingEdits();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("continues flushing other drafts when one throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn(() => {
      throw new Error("draft failed");
    });
    const healthy = vi.fn();
    const unregisterFailing = registerPendingEditFlush(failing);
    const unregisterHealthy = registerPendingEditFlush(healthy);

    flushPendingEdits();

    expect(failing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    unregisterFailing();
    unregisterHealthy();
    errorSpy.mockRestore();
  });
});
