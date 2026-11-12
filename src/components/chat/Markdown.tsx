import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSafeExternalUrl, openExternalUrl } from "@/utils/links";

/**
 * Markdown for AI output.
 *
 * Two deliberate differences from default rendering:
 * - An `<a>` click is intercepted and opened in the system browser. Without
 *   this, Tauri would navigate the app's own webview to the link target.
 * - Remote images are not rendered. A model (or a page it researched) could
 *   otherwise embed a tracking pixel and learn that the message was read.
 */
const markdownComponents: Components = {
  a({ href, children }) {
    const external = isSafeExternalUrl(href);
    return (
      <a
        href={external ? href : undefined}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
        title={external ? href : "Blocked link"}
        className="text-primary underline underline-offset-2 hover:text-primary/80"
        onClick={(event) => {
          event.preventDefault();
          if (external) openExternalUrl(href);
        }}
      >
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    const label = alt?.trim() || "Image";
    return (
      <span className="my-1 inline-flex flex-wrap items-center gap-2 rounded border border-border bg-field px-2 py-1 align-middle text-xs text-text-muted">
        <span>[{label}]</span>
        {typeof src === "string" && isSafeExternalUrl(src) && (
          <button
            type="button"
            onClick={() => openExternalUrl(src)}
            className="text-primary hover:text-primary/80"
          >
            Open image
          </button>
        )}
      </span>
    );
  },
};

/** Render assistant text as the app's serif document block. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="chat-markdown prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
