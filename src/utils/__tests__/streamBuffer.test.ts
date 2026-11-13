import { describe, it, expect } from "vitest";
import { createStreamBatcher } from "@/utils/streamBuffer";

function harness() {
  const scheduled = new Map<number, () => void>();
  let nextHandle = 1;
  const emitted: string[] = [];
  const batcher = createStreamBatcher(
    (text) => emitted.push(text),
    (callback) => {
      const handle = nextHandle++;
      scheduled.set(handle, () => {
        scheduled.delete(handle);
        callback();
      });
      return handle;
    },
    (handle) => {
      scheduled.delete(handle);
    },
  );
  return { batcher, emitted, scheduled };
}

describe("createStreamBatcher", () => {
  it("coalesces chunks and schedules a single flush", () => {
    const { batcher, emitted, scheduled } = harness();

    batcher.push("Hello");
    batcher.push(" ");
    batcher.push("world");
    expect(emitted).toEqual([]);
    expect(scheduled.size).toBe(1);

    const callback = [...scheduled.values()][0];
    callback();
    expect(emitted).toEqual(["Hello world"]);
  });

  it("schedules the next frame after a flush", () => {
    const { batcher, emitted, scheduled } = harness();
    batcher.push("a");
    [...scheduled.values()][0]();

    batcher.push("b");
    expect(scheduled.size).toBe(1);
    [...scheduled.values()][0]();

    expect(emitted).toEqual(["a", "b"]);
  });

  it("flushes buffered text immediately and cancels the scheduled frame", () => {
    const { batcher, emitted, scheduled } = harness();
    batcher.push("partial");

    batcher.flush();

    expect(emitted).toEqual(["partial"]);
    expect(scheduled.size).toBe(0);
  });

  it("drops buffered text on cancel", () => {
    const { batcher, emitted, scheduled } = harness();
    batcher.push("discard me");

    batcher.cancel();
    [...scheduled.values()].forEach((callback) => callback());

    expect(emitted).toEqual([]);
  });

  it("does not emit an empty flush", () => {
    const { batcher, emitted } = harness();
    batcher.flush();
    expect(emitted).toEqual([]);
  });
});
