import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StreamingBubbleView } from "@/components/chat/StreamingBubble";

describe("StreamingBubbleView", () => {
  it("renders the live text while a reply is streaming", () => {
    const html = renderToStaticMarkup(
      <StreamingBubbleView isSending streamingText="Hello **world**" />,
    );

    expect(html).toContain("Hello");
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("animate-pulse");
  });

  it("renders the loading dots before the first token arrives", () => {
    const html = renderToStaticMarkup(
      <StreamingBubbleView isSending streamingText="" />,
    );

    expect(html).toContain("animate-bounce");
    expect(html).not.toContain("chat-markdown");
  });

  it("renders nothing when no reply is in flight", () => {
    const html = renderToStaticMarkup(
      <StreamingBubbleView isSending={false} streamingText="stale" />,
    );

    expect(html).toBe("");
  });
});
