import { useProfileStore } from "@/stores/profileStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow] hover:border-primary/30";

export default function LinksSection() {
  const linkedinUrl = useProfileStore((s) => s.linkedinUrl);
  const setLinkedinUrl = useProfileStore((s) => s.setLinkedinUrl);

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-text-primary text-lg">Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-text-secondary text-sm font-medium">
            LinkedIn profile URL
          </Label>
          <Input
            className={inputClass}
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/your-profile"
          />
          <p className="text-xs text-text-muted">
            The AI can look at your LinkedIn profile for extra context when
            tailoring your application.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
