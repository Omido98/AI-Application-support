import { describe, expect, it } from "vitest";
import {
  CHAT_CONTEXT_MARKER,
  buildChatContextBlock,
  mergeChatContext,
  stripChatContext,
} from "@/utils/cvChatContext";

describe("CV chat context", () => {
  it("builds a bounded, visible transcript block", () => {
    const block = buildChatContextBlock([
      { role: "user", content: "  I led accessibility work.  " },
      { role: "assistant", content: "Great detail." },
    ]);
    expect(block).toContain(CHAT_CONTEXT_MARKER);
    expect(block).toContain("Candidate: I led accessibility work.");
    expect(block).toContain("Assistant: Great detail.");
  });

  it("replaces an earlier block instead of duplicating it", () => {
    const first = mergeChatContext(
      "Existing notes.",
      `${CHAT_CONTEXT_MARKER}\nFirst transcript`,
    );
    const second = mergeChatContext(
      first,
      `${CHAT_CONTEXT_MARKER}\nSecond transcript`,
    );

    expect(second).not.toContain("First transcript");
    expect(second).toContain("Second transcript");
    expect(second).toContain("Existing notes.");
  });

  it("strips only the generated block", () => {
    expect(
      stripChatContext(`Notes.\n\n${CHAT_CONTEXT_MARKER}\nCandidate: Hello`),
    ).toBe("Notes.");
    expect(stripChatContext("Notes only")).toBe("Notes only");
  });
});
