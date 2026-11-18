import { describe, expect, it } from "vitest";
import { createSaveQueue } from "@/utils/saveQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSaveQueue", () => {
  it("serializes writes and runs the next one only after the previous settles", async () => {
    const queue = createSaveQueue();
    const first = deferred<boolean>();
    const events: string[] = [];

    const one = queue.enqueue(async () => {
      events.push("first:start");
      const ok = await first.promise;
      events.push("first:end");
      return ok;
    });
    const two = queue.enqueue(async () => {
      events.push("second:start");
      return true;
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    first.resolve(true);
    await Promise.all([one, two]);

    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("waits for every queued write in whenIdle", async () => {
    const queue = createSaveQueue();
    const first = deferred<boolean>();
    let settled = false;

    const one = queue.enqueue(() => first.promise);
    const idle = queue.whenIdle();
    void idle.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    first.resolve(true);
    await one;
    await expect(idle).resolves.toBe(true);
    expect(queue.hasPending()).toBe(false);
  });

  it("reports a failed write without breaking the queue", async () => {
    const queue = createSaveQueue();

    await expect(
      queue.enqueue(async () => {
        throw new Error("disk full");
      }),
    ).resolves.toBe(false);
    await expect(queue.enqueue(async () => true)).resolves.toBe(true);
  });
});
