import { useState } from "react";
import {
  ArrowRight,
  Briefcase,
  MessageSquare,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STEPS = [
  {
    icon: Briefcase,
    title: "Track each application",
    body: "Every job gets its own row: company, posting, deadline, priority, tags, contact and the status history of your pipeline. Search and filters stay put while you move between sections.",
  },
  {
    icon: MessageSquare,
    title: "Write with an assistant that knows the job",
    body: "Each application has its own chat thread. The assistant reads the posting and your profile, can research the company, and turns drafts into improve/review suggestions you accept or discard.",
  },
  {
    icon: UserRound,
    title: "Fill in your profile once",
    body: "Education, experience, skills and previous cover letters live in Profile. Everything stays on this machine and API keys live in the OS keychain. Shortcuts: Ctrl/Cmd+1–4 switch sections, Ctrl/Cmd+, opens Settings.",
  },
];

interface OnboardingDialogProps {
  open: boolean;
  onDone: () => void;
}

/** First-run walkthrough, shown once and remembered in settings.json. */
export default function OnboardingDialog({
  open,
  onDone,
}: OnboardingDialogProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone();
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.body}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={
                index === step
                  ? "h-1.5 w-6 rounded-full bg-primary"
                  : "h-1.5 w-1.5 rounded-full bg-border"
              }
            />
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={onDone}>
            Skip
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button
              onClick={() => (isLast ? onDone() : setStep(step + 1))}
              className="bg-primary hover:bg-primary/80 text-primary-foreground"
            >
              {isLast ? "Get started" : "Next"}
              <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
