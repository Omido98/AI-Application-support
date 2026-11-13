import { useEffect, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useProfileStore } from "@/stores/profileStore";
import { analyzeCvText, extractCvText, pickCvDocument } from "@/utils/cvImport";
import type { ImportMode } from "@/utils/profileMerge";
import type { ProfileData } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Phase = "idle" | "reading" | "analyzing" | "ready" | "error";

interface ImportCvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ImportCvDialog({
  open,
  onOpenChange,
}: ImportCvDialogProps) {
  const config = useChatStore((s) => s.config);
  const configLoaded = useChatStore((s) => s.configLoaded);
  const loadConfig = useChatStore((s) => s.loadConfig);
  const applyImportedProfile = useProfileStore((s) => s.applyImportedProfile);

  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [textChars, setTextChars] = useState(0);
  const [imported, setImported] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !configLoaded) void loadConfig();
  }, [open, configLoaded, loadConfig]);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setFileName("");
      setTextChars(0);
      setImported(null);
      setError(null);
    }
  }, [open]);

  const handleChoose = async () => {
    setError(null);
    setImported(null);
    if (!configLoaded) {
      setError("AI settings are still loading. Try again in a moment.");
      return;
    }
    if (!config.apiKey) {
      setError("Configure an AI provider and API key in Settings first.");
      return;
    }
    try {
      const picked = await pickCvDocument();
      if (!picked) return;
      setFileName(picked.name);
      setPhase("reading");
      const text = await extractCvText(picked.name, picked.bytes);
      setTextChars(text.length);
      setPhase("analyzing");
      const result = await analyzeCvText(text, config);
      setImported(result);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const apply = (mode: ImportMode) => {
    if (!imported) return;
    applyImportedProfile(imported, mode);
    onOpenChange(false);
  };

  const busy = phase === "reading" || phase === "analyzing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import CV</DialogTitle>
          <DialogDescription>
            Read a PDF, DOCX or TXT CV locally, then use your AI provider to
            structure it into the profile. Only the extracted text is sent; the
            file itself never leaves this machine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button
            variant="outline"
            onClick={() => void handleChoose()}
            disabled={busy}
            className="w-full justify-center"
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <FileUp className="mr-1.5 size-4" />
            )}
            {busy
              ? phase === "reading"
                ? "Reading document…"
                : "Analyzing with AI…"
              : imported
                ? "Choose another file"
                : "Choose CV file"}
          </Button>

          {fileName && (
            <p className="text-xs text-text-muted">
              {fileName}
              {textChars > 0 &&
                ` · ${textChars.toLocaleString()} characters extracted`}
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {imported && (
            <div className="space-y-2 rounded-lg border border-border bg-field p-3">
              <p className="text-xs text-text-secondary">
                Found {imported.skills.length} skills,{" "}
                {imported.workExperience.length} work entries,{" "}
                {imported.education.length} education entries,{" "}
                {imported.languages.length} languages,{" "}
                {imported.certifications.length} certifications and{" "}
                {imported.interests.length} interests.
              </p>
              <p className="text-xs text-text-muted">
                {imported.fullName && `Name: ${imported.fullName}. `}
                {imported.email && `Email: ${imported.email}.`}
              </p>
              <p className="text-xs text-text-muted">
                Merge keeps existing entries and only fills empty fields.
                Replace overwrites the CV sections but keeps your saved cover
                letters.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {imported && (
              <>
                <Button variant="outline" onClick={() => apply("merge")}>
                  Merge into profile
                </Button>
                <Button variant="destructive" onClick={() => apply("replace")}>
                  Replace profile
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
