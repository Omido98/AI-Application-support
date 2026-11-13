import { useState } from "react";
import {
  Check,
  ClipboardCopy,
  Monitor,
  Moon,
  Plus,
  Sun,
  Download,
  Upload,
} from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  useSettingsStore,
  getAccentForeground,
} from "@/stores/settingsStore";
import {
  buildBackupBundle,
  parseBackupBundle,
  restoreBackupBundle,
} from "@/utils/backup";
import { saveJson, deleteFile } from "@/utils/storage";
import { exportBackupFile, importBackupFile } from "@/utils/backupFiles";
import { flushAllSaves } from "@/utils/flushSaves";
import {
  copyDiagnostics,
  logToFileInBackground,
} from "@/utils/diagnostics";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { useChatStore } from "@/stores/chatStore";
import ApiConfigForm from "./ApiConfigForm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PRESET_ACCENTS = [
  { name: "Mint", value: "#34d399" },
  { name: "Emerald", value: "#4ade80" },
  { name: "Sky", value: "#93c5fd" },
  { name: "Blue", value: "#60a5fa" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Orange", value: "#fb923c" },
  { name: "Rose", value: "#f87171" },
  { name: "Pink", value: "#f472b6" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Stone", value: "#a8a094" },
  { name: "Deep Teal", value: "#0f6e5c" },
];

type UpdateStatus =
  | "idle"
  | "checking"
  | "none"
  | "available"
  | "downloading"
  | "failed";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({
  open,
  onOpenChange,
}: SettingsDialogProps) {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setAccent = useSettingsStore((s) => s.setAccent);

  const [showPalette, setShowPalette] = useState(false);

  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<string | null>(
    null,
  );
  // Bumped after an import so the API form remounts from the restored config
  // instead of writing its pre-import local state back over it.
  const [configFormKey, setConfigFormKey] = useState(0);
  const isSending = useChatStore((s) => s.isSending);

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  // ── Backup ──

  const handleExport = async () => {
    setBackupStatus(null);
    if (isSending) {
      setBackupStatus("Wait for the current AI reply to finish before exporting.");
      return;
    }
    try {
      // Make sure the last 500 ms of edits are in the bundle, not just on screen.
      if (!(await flushAllSaves())) {
        setBackupStatus(
          "Some changes could not be saved to disk, so the export was cancelled.",
        );
        return;
      }
      const bundle = await buildBackupBundle();
      const defaultName = `ai-application-support-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      const filePath = await exportBackupFile(
        defaultName,
        JSON.stringify(bundle, null, 2),
      );
      if (!filePath) return;
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
      setBackupStatus(
        `Backup exported to ${fileName} (${Object.keys(bundle.files).length} files). Your API key is not included.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBackupStatus(`Export failed: ${message}`);
      logToFileInBackground(`[backup] Export failed: ${message}`);
    }
  };

  const handleImport = async () => {
    setBackupStatus(null);
    if (isSending) {
      setBackupStatus("Wait for the current AI reply to finish before importing.");
      return;
    }
    try {
      if (!(await flushAllSaves())) {
        setBackupStatus(
          "Some changes could not be saved to disk, so the import was cancelled.",
        );
        return;
      }
      const raw = await importBackupFile();
      if (raw == null) return;
      const bundle = parseBackupBundle(raw);
      if (!bundle) {
        setBackupStatus("That file is not a valid AI Application Support backup.");
        return;
      }
      const count = Object.keys(bundle.files).length;
      const confirmed = await ask(
        `This will overwrite all current applications, chat threads, profile and settings with the contents of the backup (${count} files). A safety copy of the current data is saved as backup-before-import.json first. Continue?`,
        { title: "Import backup", kind: "warning" },
      );
      if (!confirmed) return;

      // Keep a recovery point in the app-data directory before overwriting.
      const safetyCopy = await buildBackupBundle();
      if (!(await saveJson("backup-before-import.json", safetyCopy))) {
        setBackupStatus(
          "Could not create a safety copy of the current data, so the import was cancelled.",
        );
        return;
      }

      await restoreBackupBundle(bundle);
      // A backup without drafts means "no drafts", not "keep the old ones".
      if (!("drafts.json" in bundle.files)) {
        await deleteFile("drafts.json");
      }
      // Reload every store so the restored data shows immediately.
      await useApplicationStore.getState().loadApplications();
      await useProfileStore.getState().loadProfile();
      await useChatStore.getState().loadConfig();
      await useChatStore.getState().loadDrafts(true);
      await useChatStore
        .getState()
        .switchThread(useApplicationStore.getState().selectedApplicationId, true);
      await useSettingsStore.getState().loadSettings();
      setConfigFormKey((key) => key + 1);
      setBackupStatus(
        `Import complete — ${count} files restored. A safety copy of the previous data was kept as backup-before-import.json.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBackupStatus(`Import failed: ${message}`);
      logToFileInBackground(`[backup] Import failed: ${message}`);
    }
  };

  // ── Updates ──

  const handleCheckForUpdates = async () => {
    setUpdateStatus("checking");
    setUpdateMessage(null);
    try {
      const found = await check();
      if (!found) {
        setUpdateStatus("none");
        return;
      }
      setUpdate(found);
      setUpdateStatus("available");
    } catch (err) {
      setUpdateStatus("failed");
      setUpdateMessage(
        err instanceof Error ? err.message : "Could not check for updates.",
      );
      logToFileInBackground(
        `[update] Check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleInstallUpdate = async () => {
    if (!update) return;
    setUpdateStatus("downloading");
    setUpdateMessage(null);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setUpdateStatus("failed");
      setUpdateMessage(
        err instanceof Error
          ? err.message
          : "The update failed to install. Try again later.",
      );
      logToFileInBackground(
        `[update] Install failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // ── Diagnostics ──

  const handleCopyDiagnostics = async () => {
    setDiagnosticsStatus(null);
    try {
      await copyDiagnostics();
      setDiagnosticsStatus("Diagnostics copied to the clipboard.");
    } catch (err) {
      setDiagnosticsStatus(
        err instanceof Error ? err.message : "Could not copy diagnostics.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize the appearance of the app, configure your AI provider,
            manage your data, and update the app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Theme */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-text-secondary">Theme</h3>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
                className="justify-center"
              >
                <Sun className="size-4 mr-1.5" />
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
                className="justify-center"
              >
                <Moon className="size-4 mr-1.5" />
                Dark
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                onClick={() => setTheme("system")}
                title="Follow the operating system theme"
                className="justify-center"
              >
                <Monitor className="size-4 mr-1.5" />
                System
              </Button>
            </div>
          </div>

          {/* Accent colour */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-medium text-text-secondary">
                Accent colour:
              </h3>
              <button
                type="button"
                title="Choose accent colour"
                aria-label="Choose accent colour"
                onClick={() => setShowPalette((v) => !v)}
                className="size-8 rounded-md border border-border shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{ backgroundColor: accent }}
              />
            </div>

            {showPalette && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {PRESET_ACCENTS.map((c) => {
                  const selected = accent.toLowerCase() === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      title={c.name}
                      aria-label={c.name}
                      onClick={() => setAccent(c.value)}
                      className={cn(
                        "size-8 rounded-md border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        selected
                          ? "border-foreground ring-2 ring-primary/50"
                          : "border-border",
                      )}
                      style={{ backgroundColor: c.value }}
                    >
                      {selected && (
                        <Check
                          className="size-3.5 mx-auto"
                          strokeWidth={3}
                          style={{ color: getAccentForeground(c.value) }}
                        />
                      )}
                    </button>
                  );
                })}

                <label
                  title="Custom colour"
                  aria-label="Custom colour"
                  className={cn(
                    "flex items-center justify-center size-8 rounded-md border border-dashed cursor-pointer transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                    PRESET_ACCENTS.every((c) => accent.toLowerCase() !== c.value)
                      ? "border-foreground ring-2 ring-primary/50 bg-field"
                      : "border-border",
                  )}
                >
                  <input
                    type="color"
                    className="sr-only"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                  />
                  <Plus className="size-3.5 text-text-secondary" />
                </label>
              </div>
            )}
          </div>

          {/* Backup & restore */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-text-secondary">
              Backup &amp; restore
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => void handleExport()}
                disabled={isSending}
                className="justify-center"
              >
                <Download className="size-4 mr-1.5" />
                Export data
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleImport()}
                disabled={isSending}
                className="justify-center"
              >
                <Upload className="size-4 mr-1.5" />
                Import data
              </Button>
            </div>
            {backupStatus && (
              <p className="text-xs text-text-muted">{backupStatus}</p>
            )}
          </div>

          {/* API configuration */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-text-secondary">
              API configuration
            </h3>
            <ApiConfigForm key={configFormKey} />
          </div>

          {/* Updates */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-text-secondary">
              Software updates
            </h3>
            <Button
              variant="outline"
              onClick={() => void handleCheckForUpdates()}
              disabled={updateStatus === "checking" || updateStatus === "downloading"}
              className="justify-center w-full"
            >
              {updateStatus === "checking"
                ? "Checking…"
                : updateStatus === "available"
                  ? `Update to ${update?.version} available`
                  : "Check for updates"}
            </Button>
            {updateStatus === "available" && (
              <Button
                variant="default"
                onClick={() => void handleInstallUpdate()}
                className="justify-center w-full bg-primary hover:bg-primary/80 text-primary-foreground"
              >
                Download &amp; install
              </Button>
            )}
            {updateStatus === "downloading" && (
              <p className="text-xs text-text-muted">
                Downloading and installing the update… The app will restart
                when done.
              </p>
            )}
            {updateStatus === "none" && (
              <p className="text-xs text-text-muted">
                You are running the latest version.
              </p>
            )}
            {(updateStatus === "failed" || updateStatus === "idle") &&
              updateMessage && (
                <p className="text-xs text-destructive">{updateMessage}</p>
              )}
          </div>

          {/* Diagnostics */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-text-secondary">Diagnostics</h3>
            <Button
              variant="outline"
              onClick={() => void handleCopyDiagnostics()}
              className="justify-center w-full"
            >
              <ClipboardCopy className="size-4 mr-1.5" />
              Copy diagnostics
            </Button>
            <p className="text-xs text-text-muted">
              Copies app and OS versions, data-file names and sizes, and the
              recent log. API keys and chat contents are never included.
            </p>
            {diagnosticsStatus && (
              <p className="text-xs text-text-muted">{diagnosticsStatus}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
