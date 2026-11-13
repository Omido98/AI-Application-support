import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/source-serif-4";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { logToFileInBackground } from "./utils/diagnostics";
import "./index.css";

// Uncaught errors outside React's render path (event handlers, rejected
// promises) still deserve a line in the local log so Copy diagnostics can
// explain what happened.
window.addEventListener("error", (event) => {
  const error = event.error instanceof Error ? event.error : null;
  logToFileInBackground(
    `[window:error] ${error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : event.message}`,
  );
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  logToFileInBackground(
    `[window:rejection] ${
      reason instanceof Error
        ? `${reason.name}: ${reason.message}\n${reason.stack ?? ""}`
        : String(reason)
    }`,
  );
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
