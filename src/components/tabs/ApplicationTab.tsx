import { useEffect } from "react";
import { useApplicationStore } from "@/stores/applicationStore";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ApplicationTab() {
  const isLoaded = useApplicationStore((s) => s.isLoaded);
  const loadApplication = useApplicationStore((s) => s.loadApplication);

  const companyName = useApplicationStore((s) => s.companyName);
  const setCompanyName = useApplicationStore((s) => s.setCompanyName);

  const jobDescription = useApplicationStore((s) => s.jobDescription);
  const setJobDescription = useApplicationStore((s) => s.setJobDescription);

  const applicationLanguage = useApplicationStore(
    (s) => s.applicationLanguage,
  );
  const setApplicationLanguage = useApplicationStore(
    (s) => s.setApplicationLanguage,
  );

  const requirements = useApplicationStore((s) => s.requirements);
  const setRequirements = useApplicationStore((s) => s.setRequirements);

  const companyResearch = useApplicationStore((s) => s.companyResearch);
  const setCompanyResearch = useApplicationStore(
    (s) => s.setCompanyResearch,
  );

  useEffect(() => {
    if (!isLoaded) {
      loadApplication();
    }
  }, [isLoaded, loadApplication]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading application…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Application</h1>

        {/* Company Name */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="pt-4 space-y-2">
            <Label className="text-text-secondary text-sm font-medium">
              Company Name
            </Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g., Acme Corp"
              className="bg-field text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
            />
          </CardContent>
        </Card>

        {/* Job Description */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="pt-4 space-y-2">
            <Label className="text-text-secondary text-sm font-medium">
              Job Description
            </Label>
            <Textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              className="bg-field text-text-primary border-border focus-visible:ring-primary/50 min-h-[200px] transition-[border-color,box-shadow] hover:border-primary/30"
            />
          </CardContent>
        </Card>

        {/* Application Language */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="pt-4 space-y-2">
            <Label className="text-text-secondary text-sm font-medium">
              Application Language
            </Label>
            <Input
              value={applicationLanguage}
              onChange={(e) => setApplicationLanguage(e.target.value)}
              placeholder="e.g., English, Danish"
              className="bg-field text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
            />
          </CardContent>
        </Card>

        {/* Requirements */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="pt-4 space-y-2">
            <Label className="text-text-secondary text-sm font-medium">
              What does the application require?
            </Label>
            <Textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="e.g., Cover letter, Answer to 3 specific questions..."
              className="bg-field text-text-primary border-border focus-visible:ring-primary/50 min-h-[150px] transition-[border-color,box-shadow] hover:border-primary/30"
            />
          </CardContent>
        </Card>

        {/* Company Research (optional) */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="pt-4 space-y-2">
            <Label className="text-text-secondary text-sm font-medium">
              Company Research (optional)
            </Label>
            <Textarea
              value={companyResearch}
              onChange={(e) => setCompanyResearch(e.target.value)}
              placeholder="Paste any information you have about the company — website content, news articles, annual reports, etc. The AI will use this context to tailor your application."
              className="bg-field text-text-primary border-border focus-visible:ring-primary/50 min-h-[150px] transition-[border-color,box-shadow] hover:border-primary/30"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
