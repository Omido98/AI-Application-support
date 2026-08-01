import { useState } from "react";
import { Check, Moon, Plus, Sun } from "lucide-react";
import { useSettingsStore, getAccentForeground } from "@/stores/settingsStore";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize the appearance of the app.
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
