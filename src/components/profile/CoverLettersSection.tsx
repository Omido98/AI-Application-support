import { useEffect, useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { useChatStore } from "@/stores/chatStore";
import { sendMessage } from "@/utils/api";
import { buildCoverLetterSummaryPrompt } from "@/utils/systemPrompt";
import { Trash2, Plus, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { CoverLetter } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import ConfirmDeleteDialog, {
  type DeleteTarget,
} from "@/components/profile/ConfirmDeleteDialog";

function createEmptyCoverLetter(): CoverLetter {
  return {
    id: crypto.randomUUID(),
    company: "",
    content: "",
    addedAt: new Date().toISOString(),
  };
}

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow] hover:border-primary/30";
const textareaClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 min-h-[300px] transition-[border-color,box-shadow] hover:border-primary/30";

export default function CoverLettersSection() {
  const coverLetters = useProfileStore((s) => s.coverLetters);
  const coverLetterSummary = useProfileStore((s) => s.coverLetterSummary);
  const setCoverLetterSummary = useProfileStore((s) => s.setCoverLetterSummary);
  const addCoverLetter = useProfileStore((s) => s.addCoverLetter);
  const updateCoverLetter = useProfileStore((s) => s.updateCoverLetter);
  const removeCoverLetter = useProfileStore((s) => s.removeCoverLetter);

  const config = useChatStore((s) => s.config);
  const configLoaded = useChatStore((s) => s.configLoaded);
  const loadConfig = useChatStore((s) => s.loadConfig);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // New letter creation — start expanded
  const handleAdd = () => {
    const letter = createEmptyCoverLetter();
    addCoverLetter(letter);
    setExpanded((prev) => ({ ...prev, [letter.id]: true }));
  };

  /** A letter with no company and no content is deleted without confirmation. */
  const requestDeleteLetter = (cl: CoverLetter) => {
    if (!(cl.company ?? "").trim() && !cl.content.trim()) {
      removeCoverLetter(cl.id);
      return;
    }
    setDeleteTarget({
      label: cl.company
        ? `the cover letter for "${cl.company}"`
        : "this cover letter",
      onConfirm: () => removeCoverLetter(cl.id),
    });
  };

  // Extract the highlights from all cover letters via the summarizer agent.
  // The result is stored as a read-only digest the chat agent reads instead
  // of the full letters (see buildSystemPrompt).
  const handleSummarize = async () => {
    if (summarizing) return;
    if (useProfileStore.getState().coverLetters.length === 0) {
      setSummaryError("No cover letters to summarize yet. Add one first.");
      return;
    }
    setSummarizing(true);
    setSummaryError(null);
    try {
      const result = await sendMessage(
        [
          {
            role: "user",
            content: "Extract the main points from my cover letters now.",
            timestamp: new Date().toISOString(),
          },
        ],
        { ...config, webSearchEnabled: false },
        buildCoverLetterSummaryPrompt(useProfileStore.getState()),
      );
      if (result.error) {
        setSummaryError(result.error);
      } else if (result.stopped) {
        if (result.content.trim()) setCoverLetterSummary(result.content.trim());
      } else if (result.content.trim()) {
        setCoverLetterSummary(result.content.trim());
      } else {
        setSummaryError(
          "The model returned an empty summary. Please try again.",
        );
      }
    } catch {
      setSummaryError(
        "Something went wrong while summarizing the cover letters.",
      );
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">
          Previous Cover Letters
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={handleAdd}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Cover Letter
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI-extracted summary of the cover letters */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-muted max-w-md">
              The chat assistant only ever reads the summary in the text box
              below, never the full letters. After adding or editing a cover
              letter, press "Summarize cover letters" again to keep the
              summary current.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-primary text-primary hover:bg-primary/10"
              onClick={handleSummarize}
              title="Extract the main points from all previous cover letters"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {summarizing ? "Summarizing…" : "Summarize cover letters"}
            </Button>
          </div>
          <Textarea
            readOnly
            value={coverLetterSummary}
            className="bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 min-h-[100px] transition-[border-color,box-shadow] hover:border-primary/30 resize-y"
            placeholder={
              coverLetters.length === 0
                ? "Add cover letters first, then summarize."
                : "No summary yet. Press \"Summarize cover letters\" to extract the main points."
            }
          />
          {summaryError && (
            <p className="text-xs text-destructive">{summaryError}</p>
          )}
        </div>

        {coverLetters.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No cover letters yet. Click "Add Cover Letter" to get started.
          </p>
        )}

        {coverLetters.map((cl) => {
          const isExpanded = expanded[cl.id] ?? false;
          const preview = cl.content.length > 100
            ? cl.content.slice(0, 100) + "…"
            : cl.content;
          const addedDate = new Date(cl.addedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

          return (
            <Card key={cl.id} className="bg-field border-border relative overflow-visible transition-[border-color] hover:border-primary/20">
              {isExpanded && (
                <button
                  type="button"
                  onClick={() => requestDeleteLetter(cl)}
                  className="absolute top-3 right-3 text-destructive hover:text-red-400 transition-colors z-10"
                  title="Remove cover letter"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              <CardContent className={isExpanded ? "pt-6 pb-4" : "pt-3 pb-2"}>
                {!isExpanded ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(cl.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand(cl.id);
                      }
                    }}
                    className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
                    title="Expand cover letter"
                  >
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-medium truncate ${
                          cl.company ? "text-text-primary" : "text-text-muted italic"
                        }`}
                      >
                        {cl.company || "Empty cover letter"}
                      </span>
                      {cl.content ? (
                        <span className="block text-xs text-text-secondary truncate whitespace-pre-wrap">
                          {preview}
                        </span>
                      ) : (
                        <span className="block text-xs text-text-muted truncate">
                          Added {addedDate}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <ChevronDown className="h-4 w-4 text-text-muted" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteLetter(cl);
                        }}
                        className="text-destructive hover:text-red-400 transition-colors"
                        title="Remove cover letter"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      className={inputClass}
                      value={cl.company ?? ""}
                      onChange={(e) =>
                        updateCoverLetter(cl.id, { company: e.target.value })
                      }
                      placeholder="Company / organization (optional)"
                    />
                    <Textarea
                      className={textareaClass}
                      value={cl.content}
                      onChange={(e) =>
                        updateCoverLetter(cl.id, { content: e.target.value })
                      }
                      placeholder="Write or paste your cover letter here…"
                    />
                    <Button
                      variant="link"
                      size="sm"
                      className="text-text-muted hover:text-text-secondary px-0 h-auto mt-1"
                      onClick={() => toggleExpand(cl.id)}
                    >
                      Collapse <ChevronUp className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
      <ConfirmDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
