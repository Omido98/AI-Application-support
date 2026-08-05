import { useState } from "react";
import { Check, Moon, Plus, Sun, Download, Upload } from "lucide-react";
import { save, open as openDialog, ask } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
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
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { useChatStore } from "@/stores/chatStore";
import ApiConfigForm from "./ApiConfigForm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PRESET_ACCENTS = [
  { name: "Purple", value: "#7c3aed" },
  { name: "Violet", value: "#9333ea" },
  { name: "Blue", value: "#2563eb" },
  { name: "Cyan", value: "#0891b2" },
  { name: "Teal", value: "#0d9488" },
  { name: "Green", value: "#059669" },
  { name: "Amber", value: "#d97706" },
  { name: "Orange", value: "#ea580c" },
  { name: "Red", value: "#dc2626" },
  { name: "Pink", value: "#db2777" },
  { name: "Slate", value: "#475569" },
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

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  // ── Backup ──

  const handleExport = async () => {
    setBackupStatus(null);
    try {
      const bundle = await buildBackupBundle();
      const filePath = await save({
        defaultPath: `ai-application-support-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, JSON.stringify(bundle, null, 2));
      setBackupStatus(
        `Backup exported (${Object.keys(bundle.files).length} files).`,
      );
    } catch (err) {
      setBackupStatus(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleImport = async () => {
    setBackupStatus(null);
    try {
      const filePath = await openDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      const raw = await readTextFile(String(filePath));
      const bundle = parseBackupBundle(raw);
      if (!bundle) {
        setBackupStatus("That file is not a valid AI Application Support backup.");
        return;
      }
      const count = Object.keys(bundle.files).length;
      const confirmed = await ask(
        `This will overwrite all current applications, chat threads, profile and settings with the contents of the backup (${count} files). This cannot be undone. Continue?`,
        { title: "Import backup", kind: "warning" },
      );
      if (!confirmed) return;
      await restoreBackupBundle(bundle);
      // Reload every store so the restored data shows immediately.
      await useApplicationStore.getState().loadApplications();
      await useProfileStore.getState().loadProfile();
      await useChatStore.getState().loadConfig();
      await useChatStore
        .getState()
        .switchThread(useApplicationStore.getState().selectedApplicationId);
      await useSettingsStore.getState().loadSettings();
      setBackupStatus(`Import complete — ${count} files restored.`);
    } catch (err) {
      setBackupStatus(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
            <Label className="text-text-secondary text-xs">Theme</Label>
            <div className="grid grid-cols-2 gap-2">
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
            </div>
          </div>

          {/* Accent colour */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Label className="text-text-secondary text-xs">
                Accent colour:
              </Label>
              <button
                type="button"
                title="Choose accent colour"
                aria-label="Choose accent colour"
                onClick={() => setShowPalette((v) => !v)}
                className="size-7 rounded-md border border-border shadow-sm transition-transform hover:scale-105"
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
                        "size-7 rounded-md border transition-transform hover:scale-105",
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
                    "flex items-center justify-center size-7 rounded-md border border-dashed cursor-pointer transition-transform hover:scale-105",
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
            <Label className="text-text-secondary text-xs">
              Backup &amp; restore
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => void handleExport()}
                className="justify-center"
              >
                <Download className="size-4 mr-1.5" />
                Export data
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleImport()}
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
            <Label className="text-text-secondary text-xs">
              API configuration
            </Label>
            <ApiConfigForm />
          </div>

          {/* Updates */}
          <div className="space-y-2">
            <Label className="text-text-secondary text-xs">
              Software updates
            </Label>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
