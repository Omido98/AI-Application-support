import { useEffect, useState } from "react";
import { ArrowRight, Download, Sparkles } from "lucide-react";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useSettingsStore } from "@/stores/settingsStore";
import { logToFileInBackground } from "@/utils/diagnostics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UpdateNoticeProps {
  /** The update found by the startup check, or null when no notice is due. */
  update: Update | null;
  open: boolean;
  /** Dismiss the notice for the rest of this session. */
  onClose: () => void;
}

/**
 * Startup notice for a newer release. "Install update" downloads and installs
 * in place and then restarts the app; "Later" hides the notice until the next
 * launch; "Skip this version" remembers the version in settings.json so the
 * automatic check stays quiet until a newer one appears.
 */
export default function UpdateNotice({
  update,
  open,
  onClose,
}: UpdateNoticeProps) {
  const setSkippedUpdateVersion = useSettingsStore(
    (s) => s.setSkippedUpdateVersion,
  );

  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fresh notice should never show a stale error from an earlier attempt.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setProgress(null);
  }, [open]);

  if (!update) return null;

  const releaseNotes = update.body?.trim() ?? "";

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    setError(null);
    setProgress(null);

    let totalBytes: number | null = null;
    let receivedBytes = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength ?? null;
            break;
          case "Progress":
            receivedBytes += event.data.chunkLength;
            setProgress(
              totalBytes && totalBytes > 0
                ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
                : null,
            );
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });
      // downloadAndInstall only stages the new build; restart to run it.
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not install the update: ${message}`);
      setInstalling(false);
      logToFileInBackground(`[update] Install failed: ${message}`);
    }
  };

  const handleSkip = () => {
    if (installing) return;
    setSkippedUpdateVersion(update.version);
    onClose();
  };

  // Closing mid-install would leave the download running with no UI.
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !installing) onClose();
      }}
      disablePointerDismissal={installing}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={!installing}>
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            A newer version of AI Application Support is ready to install.
            Installing restarts the app; your data stays on this machine.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-field/60 px-3 py-2.5">
          <span className="font-mono text-xs text-text-muted">
            {update.currentVersion}
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-text-muted" />
          <span className="font-mono text-xs font-medium text-primary">
            {update.version}
          </span>
        </div>

        {releaseNotes && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-text-secondary">
              Release notes
            </h3>
            <div
              tabIndex={0}
              role="region"
              aria-label="Release notes"
              className="max-h-48 overflow-y-auto rounded-lg border border-border bg-field/50 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-text-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {releaseNotes}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        {installing && (
          <p role="status" className="text-xs text-text-muted">
            {progress !== null
              ? `Downloading and installing… ${progress}%`
              : "Downloading and installing the update… The app will restart when it is done."}
          </p>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={installing}
            title={`Do not remind me about version ${update.version}`}
          >
            Skip this version
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={installing}>
              Later
            </Button>
            <Button
              onClick={() => void handleInstall()}
              disabled={installing}
              className="bg-primary text-primary-foreground hover:bg-primary/80"
            >
              <Download className="size-4" aria-hidden="true" />
              {installing ? "Installing…" : "Install update"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
