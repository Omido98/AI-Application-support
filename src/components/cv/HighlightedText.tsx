import { useMemo } from "react";
import { splitHighlightedText } from "@/utils/cvHighlight";

export default function HighlightedText({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}) {
  const segments = useMemo(
    () => splitHighlightedText(text, terms),
    [text, terms],
  );
  return (
    <>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={index}
            className="rounded-sm bg-amber-200/80 px-0.5 text-inherit"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
