import { describe, expect, it } from "vitest";
import {
  CHAT_CONTEXT_END_MARKER,
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
    expect(block).toContain(CHAT_CONTEXT_END_MARKER);
    expect(block).toContain("Candidate: I led accessibility work.");
    expect(block).toContain("Assistant: Great detail.");
  });

  it("replaces an earlier block instead of duplicating it", () => {
    const first = mergeChatContext(
      "Existing notes.",
      `${CHAT_CONTEXT_MARKER}\nFirst transcript\n${CHAT_CONTEXT_END_MARKER}`,
    );
    const second = mergeChatContext(
      first,
      `${CHAT_CONTEXT_MARKER}\nSecond transcript\n${CHAT_CONTEXT_END_MARKER}`,
    );

    expect(second).not.toContain("First transcript");
    expect(second).toContain("Second transcript");
    expect(second).toContain("Existing notes.");
  });

  it("keeps user notes typed after the generated block", () => {
    const first = mergeChatContext(
      "Notes.",
      `${CHAT_CONTEXT_MARKER}\nCandidate: Old\n${CHAT_CONTEXT_END_MARKER}`,
    );
    const withNote = `${first}\n\nMy own note.`;
    const second = mergeChatContext(
      withNote,
      `${CHAT_CONTEXT_MARKER}\nCandidate: New\n${CHAT_CONTEXT_END_MARKER}`,
    );

    expect(second).not.toContain("Candidate: Old");
    expect(second).toContain("Candidate: New");
    expect(second).toContain("My own note.");
  });

  it("preserves notes after a legacy block without an end marker", () => {
    const legacy = `Notes.\n\n${CHAT_CONTEXT_MARKER}\nCandidate: Old\nAssistant: Reply\n\nMy own note.`;
    const stripped = stripChatContext(legacy);

    expect(stripped).not.toContain("Candidate: Old");
    expect(stripped).toContain("My own note.");
  });

  it("strips only the generated block", () => {
    expect(
      stripChatContext(
        `Notes.\n\n${CHAT_CONTEXT_MARKER}\nCandidate: Hello\n${CHAT_CONTEXT_END_MARKER}\n\nAfter.`,
      ),
    ).toBe("Notes.\n\nAfter.");
    expect(stripChatContext("Notes only")).toBe("Notes only");
  });
});
