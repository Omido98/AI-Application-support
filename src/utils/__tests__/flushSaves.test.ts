import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

vi.mock("@/stores/applicationStore", () => ({
  flushApplicationSave: vi.fn(async () => {
    order.push("application");
    return true;
  }),
}));
vi.mock("@/stores/profileStore", () => ({
  flushProfileSave: vi.fn(async () => {
    order.push("profile");
    return true;
  }),
}));
vi.mock("@/stores/chatStore", () => ({
  flushChatSave: vi.fn(async () => {
    order.push("chat");
    return true;
  }),
  flushDraftsSave: vi.fn(async () => {
    order.push("drafts");
    return true;
  }),
}));
vi.mock("@/stores/cvStore", () => ({
  flushCvSaves: vi.fn(async () => {
    order.push("cv");
    return true;
  }),
}));

import { flushAllSaves } from "@/utils/flushSaves";
import { registerPendingEditFlush } from "@/utils/pendingEdits";

describe("flushAllSaves", () => {
  beforeEach(() => {
    order.length = 0;
  });

  it("commits buffered editor drafts before flushing stores", async () => {
    const unregister = registerPendingEditFlush(() => order.push("draft"));
    try {
      await expect(flushAllSaves()).resolves.toBe(true);
      expect(order[0]).toBe("draft");
      expect(order).toEqual(
        expect.arrayContaining([
          "application",
          "profile",
          "chat",
          "drafts",
          "cv",
        ]),
      );
    } finally {
      unregister();
    }
  });
});
