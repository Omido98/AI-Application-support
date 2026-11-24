import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileDown,
  FileText,
  History,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import type { JobApplication } from "@/types";
import type {
  CvAiUsage,
  CvCertification,
  CvDocument,
  CvEducation,
  CvExperience,
  CvExperienceRole,
  CvLanguage,
  CvLanguageSkill,
  CvOtherEngagement,
  CvPageSize,
  CvProject,
  CvRewriteTarget,
  CvSectionId,
  CvTemplate,
} from "@/types/cv";
import { useCvStore } from "@/stores/cvStore";
import { useProfileStore } from "@/stores/profileStore";
import { useChatStore, loadChatMessagesFor } from "@/stores/chatStore";
import { newMessageId } from "@/utils/ids";
import {
  createCvDocumentFromProfile,
  profileFingerprint,
} from "@/utils/cvSchema";
import { analyzeCvDocument } from "@/utils/cvAnalysis";
import CvGroundingPanel from "@/components/cv/CvGroundingPanel";
import { analyzeCoverLetterConsistency } from "@/utils/cvConsistency";
import CvConsistencyPanel from "@/components/cv/CvConsistencyPanel";
import BufferedTextarea from "@/components/common/BufferedTextarea";
import BufferedInput from "@/components/common/BufferedInput";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { splitLines as lines } from "@/utils/lines";
import { estimateCvPages } from "@/utils/cvPageEstimate";
import { flushPendingEdits } from "@/utils/pendingEdits";
import { clearAiSection } from "@/utils/cvProvenance";
import { experienceRangeLabel, sortCvRoles } from "@/utils/cvExperience";
import { buildChatContextBlock, mergeChatContext } from "@/utils/cvChatContext";
import { CV_SECTION_LABELS, CV_UI_TEXT } from "@/utils/cvLanguage";
import { exportCvDocx } from "@/utils/cvDocx";
import { exportCvPdf } from "@/utils/cvPdf";
import CvPreview from "@/components/cv/CvPreview";
import CvRewriteDialog from "@/components/cv/CvRewriteDialog";
import CvHistoryDialog from "@/components/cv/CvHistoryDialog";
import CvLanguageDialog from "@/components/cv/CvLanguageDialog";
import CvGenerationReviewDialog from "@/components/cv/CvGenerationReviewDialog";
import {
  applyRewriteResult,
  buildRewriteProposal,
  rewriteCvSection,
  type CvRewriteProposal,
} from "@/utils/cvRewrite";
import { formatCvUsage } from "@/utils/cvUsage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const fieldClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow] hover:border-primary/30";
const textareaClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 min-h-[80px] transition-[border-color,box-shadow] hover:border-primary/30";

function inferLanguage(application: JobApplication): CvLanguage {
  const value = application.applicationLanguage.trim().toLowerCase();
  return value.includes("sv") || value.includes("swedish") ? "sv" : "en";
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function createEmptyExperienceRole(): CvExperienceRole {
  return {
    id: newMessageId(),
    title: "",
    startDate: "",
    endDate: "",
    current: false,
  };
}

function SectionCard({
  section,
  language,
  aiAssisted,
  onMove,
  canMoveUp,
  canMoveDown,
  action,
  children,
}: {
  section: CvSectionId;
  language: CvLanguage;
  aiAssisted: boolean;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const label = CV_SECTION_LABELS[language][section];
  return (
    <Card
      id={`cv-section-${section}`}
      className="scroll-mt-20 bg-surface border-border"
    >
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
            {aiAssisted && (
              <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-text-secondary">
                <Sparkles className="size-2.5 text-primary" /> AI-assisted
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {action}
            <Button
              variant="ghost"
              size="icon-sm"
              title={collapsed ? "Expand section" : "Collapse section"}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
              aria-expanded={!collapsed}
              aria-controls={`cv-section-body-${section}`}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronUp className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Move section up"
              aria-label={`Move ${label} up`}
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Move section down"
              aria-label={`Move ${label} down`}
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          </div>
        </div>
        <div id={`cv-section-body-${section}`} hidden={collapsed}>
          {!collapsed && children}
        </div>
      </CardContent>
    </Card>
  );
}

function EntryControls({
  include,
  onInclude,
  onMove,
  canMoveUp,
  canMoveDown,
  onDelete,
  label,
}: {
  include: boolean;
  onInclude: (value: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDelete: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
        <Checkbox
          checked={include}
          onCheckedChange={(checked) => onInclude(checked === true)}
          aria-label={`Include ${label}`}
        />
        Include
      </label>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Move up"
        aria-label={`Move ${label} up`}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Move down"
        aria-label={`Move ${label} down`}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Remove from CV"
        aria-label={`Remove ${label}`}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </div>
  );
}

/** Application sub-view: generate, edit and export a tailored CV. */
export default function CvBuilder({
  application,
}: {
  application: JobApplication;
}) {
  const profile = useProfileStore();
  const apiConfig = useChatStore((state) => state.config);
  const configLoaded = useChatStore((state) => state.configLoaded);
  const loadConfig = useChatStore((state) => state.loadConfig);

  const document = useCvStore((state) => state.documents[application.id]);
  const history = useCvStore((state) => state.history[application.id]);
  const snapshots = history ?? [];
  const loaded = useCvStore((state) => state.loaded[application.id]);
  const saving = useCvStore((state) => state.saving[application.id]);
  const storeError = useCvStore((state) => state.errors[application.id]);
  const generating = useCvStore((state) => state.generating[application.id]);
  const generationError = useCvStore(
    (state) => state.generationErrors[application.id],
  );
  const generationProposal = useCvStore(
    (state) => state.generationProposals[application.id] ?? null,
  );
  const loadCv = useCvStore((state) => state.loadCv);
  const setCv = useCvStore((state) => state.setCv);
  const updateCv = useCvStore((state) => state.updateCv);
  const snapshotCurrent = useCvStore((state) => state.snapshotCurrent);
  const restoreSnapshot = useCvStore((state) => state.restoreSnapshot);
  const saveCv = useCvStore((state) => state.saveCv);
  const generateCv = useCvStore((state) => state.generateCv);
  const clearGenerationProposal = useCvStore(
    (state) => state.clearGenerationProposal,
  );
  const applyGeneratedCv = useCvStore((state) => state.applyGeneratedCv);
  const cancelGeneration = useCvStore((state) => state.cancelGeneration);

  const [language, setLanguage] = useState<CvLanguage>(() =>
    inferLanguage(application),
  );
  const [pageSize, setPageSize] = useState<CvPageSize>("a4");
  const [template, setTemplate] = useState<CvTemplate>("classic");
  const [extraContext, setExtraContext] = useState("");
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [previewPages, setPreviewPages] = useState<number | null>(null);
  const [pendingLanguage, setPendingLanguage] = useState<CvLanguage | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [chatContextBusy, setChatContextBusy] = useState(false);
  const [showAllAts, setShowAllAts] = useState(false);
  const [generationBusy, setGenerationBusy] = useState(false);
  const [previousDocument, setPreviousDocument] = useState<CvDocument | null>(
    null,
  );
  const [rewriteTarget, setRewriteTarget] = useState<CvRewriteTarget | null>(
    null,
  );
  const [rewriteLabel, setRewriteLabel] = useState("");
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [rewriteProposal, setRewriteProposal] =
    useState<CvRewriteProposal | null>(null);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const rewriteController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!profile.isLoaded) void profile.loadProfile();
    if (!configLoaded) void loadConfig();
    void loadCv(application.id);
  }, [
    application.id,
    configLoaded,
    loadConfig,
    loadCv,
    profile.isLoaded,
    profile.loadProfile,
    profile,
  ]);

  useEffect(() => {
    if (!document) return;
    setLanguage(document.language);
    setPageSize(document.pageSize);
    setTemplate(document.template ?? "classic");
    setExtraContext(document.extraContext);
  }, [document]);

  useEffect(() => {
    setPreviousDocument(null);
    setView("edit");
    setHistoryOpen(false);
    setGenerationBusy(false);
    setShowAllAts(false);
  }, [application.id]);

  // A section rewrite is a modal interaction; leaving the builder must abort
  // the request rather than let its result land somewhere else.
  useEffect(
    () => () => {
      rewriteController.current?.abort();
      rewriteController.current = null;
    },
    [],
  );

  const profileHasContent = Boolean(
    profile.fullName.trim() ||
    profile.email.trim() ||
    profile.workExperience.length ||
    profile.education.length ||
    profile.skills.length ||
    profile.otherEngagements.length,
  );
  const hasJobDescription = application.jobDescription.trim().length > 0;
  const hasApiKey = apiConfig.apiKey.trim().length > 0;
  const canGenerate = profileHasContent && hasJobDescription && hasApiKey;

  const profileFingerprintValue = useMemo(
    () => profileFingerprint(profile),
    [profile],
  );

  const stale = Boolean(
    document &&
    (document.profileFingerprint !== profileFingerprintValue ||
      document.applicationUpdatedAt !== application.updatedAt),
  );

  // ATS and grounding are advisory and expensive to recompute. Use a deferred
  // document snapshot while typing; both audits share one job context and one
  // number-grounding pass.
  const analysisDocument = useDebouncedValue(document, 250);
  const analysis = useMemo(
    () =>
      analysisDocument
        ? analyzeCvDocument(analysisDocument, application, profile)
        : null,
    [analysisDocument, application, profile],
  );
  const ats = analysis?.ats ?? null;
  const grounding = analysis?.grounding ?? null;

  const pageEstimate = useMemo(
    () => (document ? estimateCvPages(document) : null),
    [document],
  );
  const consistency = useMemo(
    () =>
      analysisDocument
        ? analyzeCoverLetterConsistency(analysisDocument, profile, application)
        : null,
    [analysisDocument, application, profile],
  );
  const visiblePages =
    view === "preview" && previewPages
      ? previewPages
      : (pageEstimate?.pages ?? 1);
  const pageOverflow =
    view === "preview" ? visiblePages > 2 : Boolean(pageEstimate?.overflow);

  const atsMissingTerms = ats
    ? [...new Set([...ats.missingKeywords, ...ats.missingPhrases])]
    : [];
  const atsMatchedTerms = ats
    ? [...new Set([...ats.matchedKeywords, ...ats.matchedPhrases])]
    : [];
  const atsMatchDetails = new Map(
    (ats?.matches ?? []).map((match) => [match.term, match]),
  );
  const mustHaveGaps =
    ats?.requirements.filter(
      (requirement) =>
        requirement.priority === "must" && requirement.missingTerms.length > 0,
    ).length ?? 0;

  const patch = (updater: (current: CvDocument) => CvDocument) => {
    updateCv(application.id, updater);
  };

  /**
   * Removing a hand-written CV entry is destructive and not otherwise
   * recoverable (manual edits are never snapshotted). Take a Versions snapshot
   * first so a misclick can be restored.
   */
  const removeEntry = async (
    label: string,
    updater: (current: CvDocument) => CvDocument,
  ) => {
    if (!document) return;
    flushPendingEdits();
    await snapshotCurrent(application.id, `Before removing ${label}`);
    patch(updater);
  };

  const setField = <K extends keyof CvDocument>(
    key: K,
    value: CvDocument[K],
  ) => {
    patch((current) => ({ ...current, [key]: value }));
  };

  const updateExperience = (id: string, next: Partial<CvExperience>) => {
    patch((current) =>
      clearAiSection(
        {
          ...current,
          experience: current.experience.map((item) =>
            item.id === id ? { ...item, ...next } : item,
          ),
        },
        "experience",
      ),
    );
  };
  const updateExperienceRole = (
    experienceId: string,
    roleId: string,
    next: Partial<CvExperienceRole>,
  ) => {
    patch((current) =>
      clearAiSection(
        {
          ...current,
          experience: current.experience.map((item) =>
            item.id === experienceId
              ? {
                  ...item,
                  roles: item.roles.map((role) =>
                    role.id === roleId ? { ...role, ...next } : role,
                  ),
                }
              : item,
          ),
        },
        "experience",
      ),
    );
  };
  const addExperienceRole = (experienceId: string) => {
    patch((current) =>
      clearAiSection(
        {
          ...current,
          experience: current.experience.map((item) =>
            item.id === experienceId
              ? { ...item, roles: [...item.roles, createEmptyExperienceRole()] }
              : item,
          ),
        },
        "experience",
      ),
    );
  };
  const updateEducation = (id: string, next: Partial<CvEducation>) => {
    patch((current) =>
      clearAiSection(
        {
          ...current,
          education: current.education.map((item) =>
            item.id === id ? { ...item, ...next } : item,
          ),
        },
        "education",
      ),
    );
  };
  const updateProject = (id: string, next: Partial<CvProject>) => {
    patch((current) =>
      clearAiSection(
        {
          ...current,
          projects: current.projects.map((item) =>
            item.id === id ? { ...item, ...next } : item,
          ),
        },
        "projects",
      ),
    );
  };
  const updateCertification = (id: string, next: Partial<CvCertification>) => {
    patch((current) =>
      clearAiSection(
        {
          ...current,
          certifications: current.certifications.map((item) =>
            item.id === id ? { ...item, ...next } : item,
          ),
        },
        "certifications",
      ),
    );
  };
  const updateLanguage = (id: string, next: Partial<CvLanguageSkill>) => {
    patch((current) =>
      clearAiSection(
        {
          ...current,
          languages: current.languages.map((item) =>
            item.id === id ? { ...item, ...next } : item,
          ),
        },
        "languages",
      ),
    );
  };
  const updateOther = (id: string, next: Partial<CvOtherEngagement>) => {
    patch((current) =>
      clearAiSection(
        {
          ...current,
          otherEngagements: current.otherEngagements.map((item) =>
            item.id === id ? { ...item, ...next } : item,
          ),
        },
        "other",
      ),
    );
  };

  const setContentField = <K extends keyof CvDocument>(
    section: CvSectionId,
    key: K,
    value: CvDocument[K],
  ) => {
    patch((current) => clearAiSection({ ...current, [key]: value }, section));
  };

  const moveSection = (section: CvSectionId, direction: -1 | 1) => {
    patch((current) => {
      const index = current.sectionOrder.indexOf(section);
      return {
        ...current,
        sectionOrder: moveItem(current.sectionOrder, index, direction),
      };
    });
  };

  const startFromProfile = () => {
    flushPendingEdits();
    const next = createCvDocumentFromProfile(profile, application, {
      language,
      pageSize,
      template,
      extraContext,
    });
    setCv(application.id, next);
  };

  const handleGenerate = async (nextLanguage: CvLanguage = language) => {
    flushPendingEdits();
    const current = useCvStore.getState().documents[application.id] ?? document;
    setExportStatus(null);
    clearGenerationProposal(application.id);
    await generateCv({
      application,
      profile,
      config: apiConfig,
      options: {
        language: nextLanguage,
        pageSize: current?.pageSize ?? pageSize,
        extraContext: current?.extraContext ?? extraContext,
        template: current?.template ?? template,
      },
    });
    // The store owns the proposal so it survives navigation; the subscription
    // above opens the review dialog for this application only.
  };

  const handleAcceptGenerated = async () => {
    if (!generationProposal) return;
    setGenerationBusy(true);
    try {
      const before = await applyGeneratedCv(application.id, generationProposal);
      setLanguage(generationProposal.language);
      setPageSize(generationProposal.pageSize);
      setTemplate(generationProposal.template ?? "classic");
      setExtraContext(generationProposal.extraContext);
      if (before) setPreviousDocument(before);
      clearGenerationProposal(application.id);
      setExportStatus("Applied generated CV.");
    } finally {
      setGenerationBusy(false);
    }
  };

  const handleDiscardGenerated = () => {
    if (generationBusy) return;
    clearGenerationProposal(application.id);
    setExportStatus("Discarded generated CV.");
  };

  const handleUndo = () => {
    if (!previousDocument) return;
    // A buffered textarea may still hold a draft whose timer would otherwise
    // overwrite the restored document.
    flushPendingEdits();
    setCv(application.id, previousDocument);
    setPreviousDocument(null);
    setExportStatus("Restored the previous CV.");
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    flushPendingEdits();
    setHistoryBusy(true);
    try {
      await restoreSnapshot(application.id, snapshotId);
      setExportStatus("Restored a saved CV version.");
      setHistoryOpen(false);
    } finally {
      setHistoryBusy(false);
    }
  };

  const addRecentChatContext = async () => {
    flushPendingEdits();
    if (!document) return;
    setChatContextBusy(true);
    try {
      const messages = await loadChatMessagesFor(application.id);
      const { block, count: recentCount } = buildChatContextBlock(messages);
      if (!block) {
        setExportStatus("No chat messages to add for this application.");
        return;
      }
      updateCv(application.id, (current) => ({
        ...current,
        extraContext: mergeChatContext(current.extraContext, block),
      }));
      setExportStatus(
        `Added ${recentCount} recent chat message${recentCount === 1 ? "" : "s"} to the extra context.`,
      );
    } finally {
      setChatContextBusy(false);
    }
  };
  const closeRewrite = () => {
    rewriteController.current?.abort();
    rewriteController.current = null;
    setRewriteTarget(null);
    setRewriteBusy(false);
    setRewriteError(null);
    setRewriteProposal(null);
    setRewriteInstruction("");
  };

  const requestRewrite = (target: CvRewriteTarget, label: string) => {
    if (!document || !hasApiKey) return;
    rewriteController.current?.abort();
    setRewriteTarget(target);
    setRewriteLabel(label);
    setRewriteError(null);
    setRewriteProposal(null);
    setRewriteInstruction("");
  };

  const handleRewrite = async (instruction: string) => {
    flushPendingEdits();
    const current = useCvStore.getState().documents[application.id] ?? document;
    if (!current || !rewriteTarget) return;
    const controller = new AbortController();
    rewriteController.current?.abort();
    rewriteController.current = controller;
    setRewriteInstruction(instruction);
    setRewriteBusy(true);
    setRewriteError(null);
    setRewriteProposal(null);
    try {
      let usage: CvAiUsage | undefined;
      const result = await rewriteCvSection({
        application,
        profile,
        document: current,
        target: rewriteTarget,
        instruction,
        config: apiConfig,
        signal: controller.signal,
        onUsage: (nextUsage) => {
          usage = nextUsage;
        },
      });
      setRewriteProposal(
        buildRewriteProposal(
          current,
          rewriteTarget,
          rewriteLabel,
          result,
          profile,
          usage,
        ),
      );
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        return;
      }
      setRewriteError(error instanceof Error ? error.message : String(error));
    } finally {
      if (rewriteController.current === controller) {
        rewriteController.current = null;
        setRewriteBusy(false);
      }
    }
  };

  const handleAcceptRewrite = async () => {
    if (!rewriteProposal) return;
    flushPendingEdits();
    const before = useCvStore.getState().documents[application.id] ?? document;
    setRewriteBusy(true);
    try {
      await snapshotCurrent(
        application.id,
        `Before rewrite: ${rewriteProposal.label}`,
      );
      updateCv(application.id, (current) =>
        applyRewriteResult(
          current,
          rewriteProposal.target,
          rewriteProposal.result,
          rewriteProposal.usage,
        ),
      );
      if (before) setPreviousDocument(before);
      setExportStatus(`Applied ${rewriteProposal.label} rewrite.`);
      closeRewrite();
    } finally {
      setRewriteBusy(false);
    }
  };

  const handleTryAgain = () => {
    const instruction = rewriteInstruction;
    setRewriteProposal(null);
    setRewriteError(null);
    void handleRewrite(instruction);
  };

  const handleExport = async () => {
    flushPendingEdits();
    const current = useCvStore.getState().documents[application.id] ?? document;
    if (!current) return;
    setExportStatus(null);
    setExporting(true);
    try {
      const path = await exportCvDocx(current, application.companyName);
      if (path) {
        const name = path.split(/[\\/]/).pop() ?? path;
        setExportStatus(`Exported ${name}.`);
      }
    } catch (err) {
      setExportStatus(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    flushPendingEdits();
    const current = useCvStore.getState().documents[application.id] ?? document;
    if (!current) return;
    setExportStatus(null);
    setExportingPdf(true);
    try {
      const path = await exportCvPdf(current, application.companyName);
      if (path) {
        const name = path.split(/[\\/]/).pop() ?? path;
        setExportStatus(`Exported ${name}.`);
      }
    } catch (err) {
      setExportStatus(
        `PDF export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSave = async () => {
    flushPendingEdits();
    await saveCv(application.id);
  };

  const changeLanguage = (value: CvLanguage) => {
    if (!document) {
      setLanguage(value);
      return;
    }
    if (document.language === value) return;
    setPendingLanguage(value);
  };

  const applyHeadingsOnlyLanguage = () => {
    const next = pendingLanguage;
    if (!next) return;
    setLanguage(next);
    patch((current) => ({
      ...current,
      language: next,
      contentLanguage: current.contentLanguage ?? current.language,
    }));
    setPendingLanguage(null);
    setExportStatus(
      `Headings changed to ${next === "sv" ? "Swedish" : "English"}; body content was kept.`,
    );
  };

  const regenerateLanguage = () => {
    const next = pendingLanguage;
    if (!next) return;
    setPendingLanguage(null);
    void handleGenerate(next);
  };

  const changePageSize = (value: CvPageSize) => {
    setPageSize(value);
    if (document) setField("pageSize", value);
  };

  const changeTemplate = (value: CvTemplate) => {
    setTemplate(value);
    if (document) setField("template", value);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="space-y-5">
        <Card className="bg-surface border-border">
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  Tailor a CV for this application
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Build a one- or two-page CV from your profile, tailored to
                  this job and optimised for ATS parsing. Nothing is generated
                  until you press the button.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cv-language">CV language</Label>
                <Select
                  value={language}
                  onValueChange={(value) =>
                    value && changeLanguage(value as CvLanguage)
                  }
                >
                  <SelectTrigger id="cv-language" className="w-full bg-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="sv">Svenska</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-page-size">Page size</Label>
                <Select
                  value={pageSize}
                  onValueChange={(value) =>
                    value && changePageSize(value as CvPageSize)
                  }
                >
                  <SelectTrigger id="cv-page-size" className="w-full bg-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4</SelectItem>
                    <SelectItem value="letter">US Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cv-extra-context">
                Extra context for this CV
              </Label>
              <Textarea
                id="cv-extra-context"
                value={extraContext}
                onChange={(event) => setExtraContext(event.target.value)}
                placeholder="Add anything the CV should know that is not in your profile: a relevant achievement, a career-change rationale, the narrative you want…"
                className={textareaClass}
              />
              <p className="text-[11px] text-text-muted">
                This is treated as your own factual input. The builder will not
                invent achievements or metrics.
              </p>
            </div>

            {!profileHasContent && (
              <p className="rounded-md border border-amber-600/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                Add some profile details first so the CV has real content.
              </p>
            )}
            {!hasJobDescription && (
              <p className="rounded-md border border-amber-600/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                Add the job description in the Details view so the CV can be
                tailored.
              </p>
            )}
            {!hasApiKey && (
              <p className="rounded-md border border-border bg-field p-2 text-xs text-text-secondary">
                Configure an AI provider in Settings to generate a CV. You can
                still start from your profile and edit it manually.
              </p>
            )}
            {generationError && (
              <p role="alert" className="text-xs text-destructive">
                {generationError}
              </p>
            )}
            {storeError && (
              <p role="alert" className="text-xs text-destructive">
                {storeError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleGenerate()}
                disabled={!canGenerate || generating}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {generating ? "Generating CV…" : "Generate tailored CV"}
              </Button>
              {generating && (
                <Button
                  variant="outline"
                  onClick={() => cancelGeneration(application.id)}
                >
                  Stop
                </Button>
              )}
              <Button variant="outline" onClick={startFromProfile}>
                Start from profile
              </Button>
            </div>
          </CardContent>
        </Card>
        <CvGenerationReviewDialog
          open={generationProposal !== null}
          proposal={generationProposal}
          current={null}
          profile={profile}
          busy={generationBusy}
          onAccept={() => void handleAcceptGenerated()}
          onDiscard={handleDiscardGenerated}
        />
      </div>
    );
  }

  const sectionIndex = (section: CvSectionId) =>
    document.sectionOrder.indexOf(section);

  const rewriteAction = (target: CvRewriteTarget, label: string) => (
    <Button
      variant="ghost"
      size="sm"
      disabled={!hasApiKey || rewriteBusy}
      title={
        hasApiKey
          ? `Rewrite ${label} with AI`
          : "Configure an AI provider in Settings to use rewriting"
      }
      onClick={() => requestRewrite(target, label)}
    >
      <Sparkles className="size-3.5" /> AI rewrite
    </Button>
  );

  const renderSection = (section: CvSectionId) => {
    const index = sectionIndex(section);
    const card = (children: ReactNode, action?: ReactNode) => (
      <SectionCard
        key={section}
        section={section}
        language={document.language}
        aiAssisted={document.aiSections?.includes(section) ?? false}
        onMove={(direction) => moveSection(section, direction)}
        canMoveUp={index > 0}
        canMoveDown={index < document.sectionOrder.length - 1}
        action={action}
      >
        {children}
      </SectionCard>
    );

    switch (section) {
      case "summary":
        return card(
          <BufferedTextarea
            value={document.summary}
            onCommit={(value) => setContentField("summary", "summary", value)}
            placeholder="Professional summary tailored to this role…"
            className={textareaClass}
            aria-label="Professional summary"
          />,
          rewriteAction({ kind: "summary" }, "summary and headline"),
        );
      case "skills":
        return card(
          <div className="space-y-1.5">
            <BufferedTextarea
              value={document.skills.join("\n")}
              onCommit={(value) =>
                setContentField("skills", "skills", lines(value))
              }
              placeholder="One skill per line"
              className={textareaClass}
              aria-label="Skills, one per line"
            />
            <p className="text-[11px] text-text-muted">
              Keep only skills you can defend in an interview.
            </p>
          </div>,
        );
      case "experience":
        return card(
          <div className="space-y-3">
            {document.experience.map((item, itemIndex) => {
              const roles = sortCvRoles(item.roles);
              const groupLabel =
                item.company || roles[0]?.title || "this employer";
              return (
                <div
                  key={item.id}
                  className="space-y-2 rounded-md border border-border bg-field/40 p-3"
                >
                  <EntryControls
                    include={item.included}
                    onInclude={(included) =>
                      updateExperience(item.id, { included })
                    }
                    onMove={(direction) =>
                      patch((current) => ({
                        ...current,
                        experience: moveItem(
                          current.experience,
                          itemIndex,
                          direction,
                        ),
                      }))
                    }
                    canMoveUp={itemIndex > 0}
                    canMoveDown={itemIndex < document.experience.length - 1}
                    onDelete={() =>
                      void removeEntry(
                        `the employer group "${groupLabel}"`,
                        (current) => ({
                          ...current,
                          experience: current.experience.filter(
                            (entry) => entry.id !== item.id,
                          ),
                        }),
                      )
                    }
                    label={groupLabel}
                  />
                  {rewriteAction(
                    { kind: "experience", id: item.id },
                    `${groupLabel} bullets`,
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <BufferedInput
                      value={item.company}
                      onCommit={(value) =>
                        updateExperience(item.id, { company: value })
                      }
                      placeholder="Employer"
                      className={fieldClass}
                      aria-label={`Company for ${groupLabel}`}
                    />
                    <BufferedInput
                      value={item.location}
                      onCommit={(value) =>
                        updateExperience(item.id, { location: value })
                      }
                      placeholder="Location (optional)"
                      className={fieldClass}
                      aria-label={`Location for ${groupLabel}`}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-text-secondary text-xs">
                        Roles (newest first)
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary/80 h-6 px-2 text-xs"
                        onClick={() => addExperienceRole(item.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add role
                      </Button>
                    </div>
                    {roles.map((role, roleIndex) => (
                      <div
                        key={role.id}
                        className="space-y-2 rounded-md border border-border bg-surface p-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <div className="grid flex-1 gap-1.5">
                            <Label
                              htmlFor={`cv-role-${role.id}`}
                              className="text-text-secondary text-xs"
                            >
                              Role title
                            </Label>
                            <BufferedInput
                              id={`cv-role-${role.id}`}
                              value={role.title}
                              onCommit={(value) =>
                                updateExperienceRole(item.id, role.id, {
                                  title: value,
                                })
                              }
                              placeholder="e.g. Senior Management Consultant"
                              className={fieldClass}
                              aria-label={`Role ${roleIndex + 1} for ${groupLabel}`}
                            />
                          </div>
                          {roles.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                void removeEntry(
                                  `the role "${role.title || "role"}" at ${groupLabel}`,
                                  (current) =>
                                    clearAiSection(
                                      {
                                        ...current,
                                        experience: current.experience.map(
                                          (entry) => {
                                            if (entry.id !== item.id) {
                                              return entry;
                                            }
                                            const roles = entry.roles.filter(
                                              (entryRole) =>
                                                entryRole.id !== role.id,
                                            );
                                            return {
                                              ...entry,
                                              sourceId:
                                                sortCvRoles(roles)[0]?.sourceId,
                                              roles,
                                            };
                                          },
                                        ),
                                      },
                                      "experience",
                                    ),
                                )
                              }
                              className="text-destructive hover:text-red-400 transition-colors shrink-0 mt-6"
                              title="Remove role"
                              aria-label={`Remove role ${
                                role.title || roleIndex + 1
                              } from ${groupLabel}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <BufferedInput
                            value={role.startDate}
                            onCommit={(value) =>
                              updateExperienceRole(item.id, role.id, {
                                startDate: value,
                              })
                            }
                            placeholder="Start"
                            className={fieldClass}
                            aria-label={`Start date for ${role.title || "role"}`}
                          />
                          <BufferedInput
                            value={role.endDate}
                            onCommit={(value) =>
                              updateExperienceRole(item.id, role.id, {
                                endDate: value,
                              })
                            }
                            placeholder="End"
                            className={fieldClass}
                            disabled={role.current}
                            aria-label={`End date for ${role.title || "role"}`}
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-text-secondary">
                          <Checkbox
                            checked={role.current}
                            aria-label={`Current role: ${
                              role.title || roleIndex + 1
                            }`}
                            onCheckedChange={(checked) => {
                              const present =
                                CV_UI_TEXT[document.language].present;
                              const presentLabels = [
                                CV_UI_TEXT.en.present,
                                CV_UI_TEXT.sv.present,
                              ];
                              updateExperienceRole(item.id, role.id, {
                                current: checked === true,
                                endDate:
                                  checked === true
                                    ? present
                                    : presentLabels.includes(role.endDate)
                                      ? ""
                                      : role.endDate,
                              });
                            }}
                          />
                          Current role
                        </label>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-text-muted">
                    Employer dates:{" "}
                    {experienceRangeLabel(item, document.language) ||
                      "add role dates"}
                  </p>

                  <div className="space-y-1">
                    <Label className="text-xs">Bullets (one per line)</Label>
                    <BufferedTextarea
                      value={item.bullets.join("\n")}
                      onCommit={(value) =>
                        updateExperience(item.id, {
                          bullets: lines(value),
                        })
                      }
                      className={textareaClass}
                      aria-label={`Bullets for ${groupLabel}`}
                    />
                  </div>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch((current) =>
                  clearAiSection(
                    {
                      ...current,
                      experience: [
                        ...current.experience,
                        {
                          id: newMessageId(),
                          company: "",
                          location: "",
                          roles: [createEmptyExperienceRole()],
                          bullets: [],
                          included: true,
                        },
                      ],
                    },
                    "experience",
                  ),
                )
              }
            >
              <Plus className="size-3.5" /> Add employer
            </Button>
          </div>,
        );
      case "education":
        return card(
          <div className="space-y-3">
            {document.education.map((item, itemIndex) => (
              <div
                key={item.id}
                className="space-y-2 rounded-md border border-border bg-field/40 p-3"
              >
                <EntryControls
                  include={item.included}
                  onInclude={(included) =>
                    updateEducation(item.id, { included })
                  }
                  onMove={(direction) =>
                    patch((current) => ({
                      ...current,
                      education: moveItem(
                        current.education,
                        itemIndex,
                        direction,
                      ),
                    }))
                  }
                  canMoveUp={itemIndex > 0}
                  canMoveDown={itemIndex < document.education.length - 1}
                  onDelete={() =>
                    void removeEntry(item.school || "education", (current) => ({
                      ...current,
                      education: current.education.filter(
                        (entry) => entry.id !== item.id,
                      ),
                    }))
                  }
                  label={item.school || "education"}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <BufferedInput
                    value={item.school}
                    onCommit={(value) =>
                      updateEducation(item.id, { school: value })
                    }
                    placeholder="School"
                    className={fieldClass}
                  />
                  <BufferedInput
                    value={item.degree}
                    onCommit={(value) =>
                      updateEducation(item.id, { degree: value })
                    }
                    placeholder="Degree"
                    className={fieldClass}
                  />
                  <BufferedInput
                    value={item.field}
                    onCommit={(value) =>
                      updateEducation(item.id, { field: value })
                    }
                    placeholder="Field / programme"
                    className={fieldClass}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <BufferedInput
                      value={item.startDate}
                      onCommit={(value) =>
                        updateEducation(item.id, { startDate: value })
                      }
                      placeholder="Start"
                      className={fieldClass}
                    />
                    <BufferedInput
                      value={item.endDate}
                      onCommit={(value) =>
                        updateEducation(item.id, { endDate: value })
                      }
                      placeholder="End"
                      className={fieldClass}
                    />
                  </div>
                </div>
                <BufferedTextarea
                  value={item.details.join("\n")}
                  onCommit={(value) =>
                    updateEducation(item.id, {
                      details: lines(value),
                    })
                  }
                  placeholder="Details (one per line)"
                  className={textareaClass}
                  aria-label={`Details for ${item.school || "education"}`}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch((current) => ({
                  ...current,
                  education: [
                    ...current.education,
                    {
                      id: newMessageId(),
                      school: "",
                      degree: "",
                      field: "",
                      startDate: "",
                      endDate: "",
                      details: [],
                      included: true,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-3.5" /> Add education
            </Button>
          </div>,
        );
      case "projects":
        return card(
          <div className="space-y-3">
            {document.projects.map((item, itemIndex) => (
              <div
                key={item.id}
                className="space-y-2 rounded-md border border-border bg-field/40 p-3"
              >
                <EntryControls
                  include={item.included}
                  onInclude={(included) => updateProject(item.id, { included })}
                  onMove={(direction) =>
                    patch((current) => ({
                      ...current,
                      projects: moveItem(
                        current.projects,
                        itemIndex,
                        direction,
                      ),
                    }))
                  }
                  canMoveUp={itemIndex > 0}
                  canMoveDown={itemIndex < document.projects.length - 1}
                  onDelete={() =>
                    void removeEntry(
                      item.title || item.description || "project",
                      (current) => ({
                        ...current,
                        projects: current.projects.filter(
                          (entry) => entry.id !== item.id,
                        ),
                      }),
                    )
                  }
                  label={item.title || item.description || "project"}
                />
                {rewriteAction(
                  { kind: "project", id: item.id },
                  `${item.title || "project"} text`,
                )}
                <BufferedInput
                  value={item.title}
                  onCommit={(value) => updateProject(item.id, { title: value })}
                  placeholder="Project title"
                  className={fieldClass}
                />
                <BufferedInput
                  value={item.period}
                  onCommit={(value) =>
                    updateProject(item.id, { period: value })
                  }
                  placeholder="Dates (e.g. Jan 2024 – Jun 2025)"
                  className={fieldClass}
                />
                <BufferedTextarea
                  value={item.description}
                  onCommit={(value) =>
                    updateProject(item.id, { description: value })
                  }
                  placeholder="Project description"
                  className={textareaClass}
                  aria-label={`Description for ${item.title || "project"}`}
                />
                <BufferedTextarea
                  value={item.bullets.join("\n")}
                  onCommit={(value) =>
                    updateProject(item.id, {
                      bullets: lines(value),
                    })
                  }
                  placeholder="Achievement bullets (one per line)"
                  className={textareaClass}
                  aria-label={`Bullets for ${item.title || "project"}`}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch((current) => ({
                  ...current,
                  projects: [
                    ...current.projects,
                    {
                      id: newMessageId(),
                      title: "",
                      description: "",
                      period: "",
                      bullets: [],
                      included: true,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-3.5" /> Add project
            </Button>
          </div>,
        );
      case "certifications":
        return card(
          <div className="space-y-2">
            {document.certifications.map((item, itemIndex) => (
              <div
                key={item.id}
                className="space-y-2 rounded-md border border-border bg-field/40 p-3"
              >
                <EntryControls
                  include={item.included}
                  onInclude={(included) =>
                    updateCertification(item.id, { included })
                  }
                  onMove={(direction) =>
                    patch((current) => ({
                      ...current,
                      certifications: moveItem(
                        current.certifications,
                        itemIndex,
                        direction,
                      ),
                    }))
                  }
                  canMoveUp={itemIndex > 0}
                  canMoveDown={itemIndex < document.certifications.length - 1}
                  onDelete={() =>
                    void removeEntry(
                      item.name || "certification",
                      (current) => ({
                        ...current,
                        certifications: current.certifications.filter(
                          (entry) => entry.id !== item.id,
                        ),
                      }),
                    )
                  }
                  label={item.name || "certification"}
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <BufferedInput
                    value={item.name}
                    onCommit={(value) =>
                      updateCertification(item.id, { name: value })
                    }
                    placeholder="Certification"
                    className={fieldClass}
                  />
                  <BufferedInput
                    value={item.issuer}
                    onCommit={(value) =>
                      updateCertification(item.id, { issuer: value })
                    }
                    placeholder="Issuer"
                    className={fieldClass}
                  />
                  <BufferedInput
                    value={item.date}
                    onCommit={(value) =>
                      updateCertification(item.id, { date: value })
                    }
                    placeholder="Date"
                    className={fieldClass}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch((current) => ({
                  ...current,
                  certifications: [
                    ...current.certifications,
                    {
                      id: newMessageId(),
                      name: "",
                      issuer: "",
                      date: "",
                      included: true,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-3.5" /> Add certification
            </Button>
          </div>,
        );
      case "languages":
        return card(
          <div className="space-y-2">
            {document.languages.map((item, itemIndex) => (
              <div
                key={item.id}
                className="space-y-2 rounded-md border border-border bg-field/40 p-3"
              >
                <EntryControls
                  include={item.included}
                  onInclude={(included) =>
                    updateLanguage(item.id, { included })
                  }
                  onMove={(direction) =>
                    patch((current) => ({
                      ...current,
                      languages: moveItem(
                        current.languages,
                        itemIndex,
                        direction,
                      ),
                    }))
                  }
                  canMoveUp={itemIndex > 0}
                  canMoveDown={itemIndex < document.languages.length - 1}
                  onDelete={() =>
                    void removeEntry(item.name || "language", (current) => ({
                      ...current,
                      languages: current.languages.filter(
                        (entry) => entry.id !== item.id,
                      ),
                    }))
                  }
                  label={item.name || "language"}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <BufferedInput
                    value={item.name}
                    onCommit={(value) =>
                      updateLanguage(item.id, { name: value })
                    }
                    placeholder="Language"
                    className={fieldClass}
                  />
                  <BufferedInput
                    value={item.level}
                    onCommit={(value) =>
                      updateLanguage(item.id, { level: value })
                    }
                    placeholder="Level"
                    className={fieldClass}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch((current) => ({
                  ...current,
                  languages: [
                    ...current.languages,
                    {
                      id: newMessageId(),
                      name: "",
                      level: "",
                      included: true,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-3.5" /> Add language
            </Button>
          </div>,
        );
      case "other":
        return card(
          <div className="space-y-3">
            {document.otherEngagements.map((item, itemIndex) => (
              <div
                key={item.id}
                className="space-y-2 rounded-md border border-border bg-field/40 p-3"
              >
                <EntryControls
                  include={item.included}
                  onInclude={(included) => updateOther(item.id, { included })}
                  onMove={(direction) =>
                    patch((current) => ({
                      ...current,
                      otherEngagements: moveItem(
                        current.otherEngagements,
                        itemIndex,
                        direction,
                      ),
                    }))
                  }
                  canMoveUp={itemIndex > 0}
                  canMoveDown={itemIndex < document.otherEngagements.length - 1}
                  onDelete={() =>
                    void removeEntry(
                      item.organization || "other experience",
                      (current) => ({
                        ...current,
                        otherEngagements: current.otherEngagements.filter(
                          (entry) => entry.id !== item.id,
                        ),
                      }),
                    )
                  }
                  label={item.organization || "other experience"}
                />
                {rewriteAction(
                  { kind: "other", id: item.id },
                  `${item.organization || "other experience"} bullets`,
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <BufferedInput
                    value={item.organization}
                    onCommit={(value) =>
                      updateOther(item.id, { organization: value })
                    }
                    placeholder="Organization"
                    className={fieldClass}
                  />
                  <BufferedInput
                    value={item.role}
                    onCommit={(value) => updateOther(item.id, { role: value })}
                    placeholder="Role"
                    className={fieldClass}
                  />
                  <BufferedInput
                    value={item.startDate}
                    onCommit={(value) =>
                      updateOther(item.id, { startDate: value })
                    }
                    placeholder="Start"
                    className={fieldClass}
                  />
                  <BufferedInput
                    value={item.endDate}
                    onCommit={(value) =>
                      updateOther(item.id, { endDate: value })
                    }
                    placeholder="End"
                    className={fieldClass}
                    disabled={item.current}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <Checkbox
                    checked={item.current}
                    onCheckedChange={(checked) =>
                      updateOther(item.id, {
                        current: checked === true,
                        endDate:
                          checked === true
                            ? CV_UI_TEXT[document.language].present
                            : item.endDate,
                      })
                    }
                  />
                  Ongoing
                </label>
                <BufferedTextarea
                  value={item.bullets.join("\n")}
                  onCommit={(value) =>
                    updateOther(item.id, {
                      bullets: lines(value),
                    })
                  }
                  placeholder="Bullets (one per line)"
                  className={textareaClass}
                  aria-label={`Bullets for ${
                    item.organization || "other experience"
                  }`}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch((current) => ({
                  ...current,
                  otherEngagements: [
                    ...current.otherEngagements,
                    {
                      id: newMessageId(),
                      organization: "",
                      role: "",
                      startDate: "",
                      endDate: "",
                      current: false,
                      bullets: [],
                      included: true,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-3.5" /> Add other experience
            </Button>
          </div>,
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Tailored CV
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {document.pageSize === "a4" ? "A4" : "US Letter"} ·{" "}
            {document.language === "sv" ? "Svenska" : "English"} ·{" "}
            {saving ? "Saving…" : storeError ? "Not saved" : "Saved locally"} ·{" "}
            ~{visiblePages} {visiblePages === 1 ? "page" : "pages"}
          </p>
          {document.lastUsage && (
            <p
              className="mt-1 font-mono text-[10px] text-text-muted"
              title={document.lastUsage.model}
            >
              Last AI: {formatCvUsage(document.lastUsage)} ·{" "}
              {document.lastUsage.model}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            disabled={snapshots.length === 0}
            title={
              snapshots.length === 0
                ? "Versions are saved before AI regeneration, before an accepted rewrite, before removing an entry and before a restore"
                : "Restore an earlier CV version"
            }
          >
            <History className="size-3.5" /> Versions ({snapshots.length})
          </Button>
          <div className="flex rounded-md border border-border bg-field p-0.5">
            <Button
              variant={view === "edit" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "edit"}
              onClick={() => setView("edit")}
            >
              <Pencil className="size-3.5" /> Edit
            </Button>
            <Button
              variant={view === "preview" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "preview"}
              onClick={() => setView("preview")}
            >
              <Eye className="size-3.5" /> Preview
            </Button>
          </div>
          {previousDocument && (
            <Button variant="ghost" size="sm" onClick={handleUndo}>
              <Undo2 className="size-3.5" /> Undo replacement
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            <Save className="size-3.5" /> Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Export Word
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExportPdf()}
            disabled={exportingPdf}
          >
            {exportingPdf ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileDown className="size-3.5" />
            )}
            Export PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate || generating}
          >
            {generating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Regenerate
          </Button>
          {generating && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancelGeneration(application.id)}
            >
              Stop
            </Button>
          )}
        </div>
      </div>

      {storeError && (
        <p role="alert" className="text-xs text-destructive">
          {storeError}
        </p>
      )}
      {generationError && (
        <p role="alert" className="text-xs text-destructive">
          {generationError}
        </p>
      )}
      {exportStatus && (
        <p role="status" className="text-xs text-text-secondary">
          {exportStatus}
        </p>
      )}
      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
          <span>
            Your profile or this application changed after the CV was generated.
            Regenerate to pick up the changes, or keep editing manually.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate || generating}
          >
            Regenerate
          </Button>
        </div>
      )}
      {pageOverflow && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-600/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Estimated {visiblePages} pages. Most tailored CVs should fit on one
            or two pages; trim older or less relevant material before exporting.
          </span>
        </div>
      )}
      {document.contentLanguage &&
        document.contentLanguage !== document.language && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
          >
            <span>
              Headings are {document.language === "sv" ? "Swedish" : "English"},
              but the body was written in{" "}
              {document.contentLanguage === "sv" ? "Swedish" : "English"}.
              Regenerate to translate it, or mark it once you have translated
              the body yourself.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setField("contentLanguage", document.language)}
            >
              Mark body as translated
            </Button>
          </div>
        )}
      {grounding && grounding.warnings.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-600/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Grounding review found {grounding.warnings.length} item
            {grounding.warnings.length === 1 ? "" : "s"} that may not be
            supported by your profile. Check the Grounding review panel before
            exporting.
          </span>
        </div>
      )}

      {view === "preview" ? (
        <CvPreview
          document={document}
          highlightTerms={ats?.highlightTerms}
          onPageCount={setPreviewPages}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Card className="bg-surface border-border">
              <CardContent className="space-y-3 pt-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  Contact
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="cv-contact-full-name">Full name</Label>
                    <BufferedInput
                      id="cv-contact-full-name"
                      value={document.contact.fullName}
                      onCommit={(value) =>
                        patch((current) => ({
                          ...current,
                          contact: { ...current.contact, fullName: value },
                        }))
                      }
                      placeholder="Full name"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cv-contact-email">Email</Label>
                    <BufferedInput
                      id="cv-contact-email"
                      value={document.contact.email}
                      onCommit={(value) =>
                        patch((current) => ({
                          ...current,
                          contact: { ...current.contact, email: value },
                        }))
                      }
                      placeholder="Email"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cv-contact-phone">Phone</Label>
                    <BufferedInput
                      id="cv-contact-phone"
                      value={document.contact.phone}
                      onCommit={(value) =>
                        patch((current) => ({
                          ...current,
                          contact: { ...current.contact, phone: value },
                        }))
                      }
                      placeholder="Phone"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cv-contact-location">Location</Label>
                    <BufferedInput
                      id="cv-contact-location"
                      value={document.contact.location}
                      onCommit={(value) =>
                        patch((current) => ({
                          ...current,
                          contact: { ...current.contact, location: value },
                        }))
                      }
                      placeholder="Location"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cv-contact-linkedin">LinkedIn URL</Label>
                    <BufferedInput
                      id="cv-contact-linkedin"
                      value={document.contact.linkedinUrl}
                      onCommit={(value) =>
                        patch((current) => ({
                          ...current,
                          contact: { ...current.contact, linkedinUrl: value },
                        }))
                      }
                      placeholder="LinkedIn URL"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cv-contact-portfolio">
                      Portfolio / website
                    </Label>
                    <BufferedInput
                      id="cv-contact-portfolio"
                      value={document.contact.portfolioUrl}
                      onCommit={(value) =>
                        patch((current) => ({
                          ...current,
                          contact: { ...current.contact, portfolioUrl: value },
                        }))
                      }
                      placeholder="Portfolio / website"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cv-contact-github">GitHub URL</Label>
                    <BufferedInput
                      id="cv-contact-github"
                      value={document.contact.githubUrl}
                      onCommit={(value) =>
                        patch((current) => ({
                          ...current,
                          contact: { ...current.contact, githubUrl: value },
                        }))
                      }
                      placeholder="GitHub URL"
                      className={fieldClass}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-surface border-border">
              <CardContent className="space-y-3 pt-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  Headline
                </h3>
                <BufferedInput
                  value={document.headline}
                  onCommit={(value) =>
                    setContentField("summary", "headline", value)
                  }
                  placeholder="Headline, e.g. Frontend Engineer focused on accessible design systems"
                  className={fieldClass}
                />
              </CardContent>
            </Card>

            {document.sectionOrder.map(renderSection)}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <Card className="bg-surface border-border">
              <CardContent className="space-y-2 pt-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  Jump to section
                </h3>
                <nav aria-label="CV sections" className="grid gap-0.5">
                  {document.sectionOrder.map((section) => (
                    <Button
                      key={section}
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      onClick={() => {
                        const target = globalThis.document.getElementById(
                          `cv-section-${section}`,
                        );
                        const reduceMotion = globalThis.matchMedia?.(
                          "(prefers-reduced-motion: reduce)",
                        ).matches;
                        target?.scrollIntoView({
                          behavior: reduceMotion ? "auto" : "smooth",
                          block: "start",
                        });
                      }}
                    >
                      {CV_SECTION_LABELS[document.language][section]}
                    </Button>
                  ))}
                </nav>
              </CardContent>
            </Card>
            {grounding && <CvGroundingPanel report={grounding} />}
            {consistency?.hasContext && (
              <CvConsistencyPanel report={consistency} />
            )}
            <Card className="bg-surface border-border">
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">
                    ATS readiness
                  </h3>
                  <span className="font-mono text-[11px] text-text-secondary">
                    {ats ? `${Math.round(ats.keywordCoverage * 100)}%` : "—"}
                  </span>
                </div>
                {ats && (
                  <>
                    <p className="text-[11px] text-text-muted">
                      Phrase and curated-synonym matching from the job title,
                      description and requirements. Use missing terms only if
                      they are true.
                    </p>
                    {ats.requirements.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Requirements ({ats.requirements.length})
                          </p>
                          {mustHaveGaps > 0 && (
                            <span className="rounded border border-amber-600/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
                              {mustHaveGaps} must-have gap
                              {mustHaveGaps === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {(showAllAts
                            ? ats.requirements
                            : ats.requirements.slice(0, 5)
                          ).map((requirement) => (
                            <div
                              key={requirement.id}
                              className="rounded border border-border bg-field/40 p-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[10px] leading-snug text-text-secondary">
                                  {requirement.label}
                                </p>
                                <span
                                  className={cn(
                                    "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                                    requirement.priority === "must"
                                      ? "bg-primary/10 text-text-secondary"
                                      : "bg-field text-text-muted",
                                  )}
                                >
                                  {requirement.priority === "must"
                                    ? "Must-have"
                                    : "Preferred"}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {requirement.matchedTerms.map((term) => (
                                  <span
                                    key={`${requirement.id}-m-${term}`}
                                    className="rounded border border-green-700/30 bg-green-500/10 px-1 py-0.5 text-[9px] text-green-800 dark:text-green-300"
                                  >
                                    {term}
                                  </span>
                                ))}
                                {requirement.missingTerms.map((term) => (
                                  <span
                                    key={`${requirement.id}-x-${term}`}
                                    className="rounded border border-amber-600/30 bg-amber-500/10 px-1 py-0.5 text-[9px] text-amber-800 dark:text-amber-300"
                                  >
                                    {term}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        {!showAllAts && ats.requirements.length > 5 && (
                          <p className="text-[10px] text-text-muted">
                            Showing the first 5 requirement groups.
                          </p>
                        )}
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        Missing ({atsMissingTerms.length})
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(showAllAts
                          ? atsMissingTerms
                          : atsMissingTerms.slice(0, 12)
                        ).map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded border border-amber-600/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300"
                          >
                            {keyword}
                          </span>
                        ))}
                        {atsMissingTerms.length === 0 && (
                          <span className="text-[11px] text-text-muted">
                            None detected.
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        Matched ({atsMatchedTerms.length})
                      </p>
                      <p className="mt-1 text-[10px] text-text-muted">
                        Unlabeled chips are exact matches. Phrase and synonym
                        badges show why a term matched.
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(showAllAts
                          ? atsMatchedTerms
                          : atsMatchedTerms.slice(0, 12)
                        ).map((keyword) => {
                          const detail = atsMatchDetails.get(keyword);
                          return (
                            <span
                              key={keyword}
                              title={`${detail?.type ?? "exact"} match for ${keyword}`}
                              aria-label={`${keyword} (${detail?.type ?? "exact"} match${detail ? `; found ${detail.matched}` : ""})`}
                              className="rounded border border-green-700/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-800 dark:text-green-300"
                            >
                              {detail?.type === "synonym"
                                ? `${detail.matched} (${keyword})`
                                : (detail?.matched ?? keyword)}
                              {detail && detail.type !== "exact" && (
                                <span className="ml-1 rounded bg-green-700/10 px-1 py-0.5 text-[8px] uppercase tracking-wide opacity-80">
                                  {detail.type}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    {ats.highlightTerms.length > 0 && (
                      <p className="text-[10px] text-text-muted">
                        Matched terms are highlighted in Preview.
                      </p>
                    )}
                    {(ats.requirements.length > 5 ||
                      atsMissingTerms.length > 12 ||
                      atsMatchedTerms.length > 12) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setShowAllAts((value) => !value)}
                      >
                        {showAllAts ? "Show fewer terms" : "Show all terms"}
                      </Button>
                    )}
                    <ul className="space-y-1 border-t border-border pt-2">
                      {ats.checks.map((check) => (
                        <li
                          key={check.id}
                          className="flex items-start gap-1.5 text-[11px]"
                        >
                          {check.ok ? (
                            <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-green-700 dark:text-green-400" />
                          ) : (
                            <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-700 dark:text-amber-400" />
                          )}
                          <span>
                            <span className="text-text-primary">
                              {check.label}
                            </span>
                            {!check.ok && (
                              <span className="block text-text-muted">
                                {check.detail}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="border-t border-border pt-2 text-[10px] text-text-muted">
                      {ats.wordCount} words. ATS guidance is not a guarantee;
                      always check the exported file.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-surface border-border">
              <CardContent className="space-y-2 pt-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  CV settings
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="cv-language-edit">Language</Label>
                  <Select
                    value={document.language}
                    onValueChange={(value) =>
                      value && changeLanguage(value as CvLanguage)
                    }
                  >
                    <SelectTrigger
                      id="cv-language-edit"
                      className="w-full bg-field"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="sv">Svenska</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cv-page-size-edit">Page size</Label>
                  <Select
                    value={document.pageSize}
                    onValueChange={(value) =>
                      value && changePageSize(value as CvPageSize)
                    }
                  >
                    <SelectTrigger
                      id="cv-page-size-edit"
                      className="w-full bg-field"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a4">A4</SelectItem>
                      <SelectItem value="letter">US Letter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cv-template-edit">Template</Label>
                  <Select
                    value={document.template ?? "classic"}
                    onValueChange={(value) =>
                      value && changeTemplate(value as CvTemplate)
                    }
                  >
                    <SelectTrigger
                      id="cv-template-edit"
                      className="w-full bg-field"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-text-muted">
                    Both templates are single-column and ATS-safe.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cv-extra-context-edit">Extra context</Label>
                  <BufferedTextarea
                    id="cv-extra-context-edit"
                    value={document.extraContext}
                    onCommit={(value) => setField("extraContext", value)}
                    className={textareaClass}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => void addRecentChatContext()}
                    disabled={chatContextBusy}
                  >
                    {chatContextBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <MessageSquareText className="size-3.5" />
                    )}
                    Add recent chat details
                  </Button>
                  <p className="text-[10px] text-text-muted">
                    Replaces the previous generated excerpt with a short,
                    visible transcript excerpt. Nothing from chat is used unless
                    you add it; notes outside the generated block are kept.
                  </p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
      <CvRewriteDialog
        open={rewriteTarget !== null}
        label={rewriteLabel}
        busy={rewriteBusy}
        error={rewriteError}
        proposal={rewriteProposal}
        onClose={closeRewrite}
        onRewrite={(instruction) => void handleRewrite(instruction)}
        onAccept={() => void handleAcceptRewrite()}
        onTryAgain={handleTryAgain}
      />
      <CvHistoryDialog
        open={historyOpen}
        snapshots={snapshots}
        busy={historyBusy}
        onClose={() => setHistoryOpen(false)}
        onRestore={(snapshotId) => void handleRestoreSnapshot(snapshotId)}
      />
      <CvLanguageDialog
        open={pendingLanguage !== null}
        current={document.language}
        next={pendingLanguage}
        busy={generating}
        canRegenerate={canGenerate}
        onClose={() => setPendingLanguage(null)}
        onHeadingsOnly={applyHeadingsOnlyLanguage}
        onRegenerate={regenerateLanguage}
      />
      <CvGenerationReviewDialog
        open={generationProposal !== null}
        proposal={generationProposal}
        current={document}
        profile={profile}
        busy={generationBusy}
        onAccept={() => void handleAcceptGenerated()}
        onDiscard={handleDiscardGenerated}
      />
    </div>
  );
}
