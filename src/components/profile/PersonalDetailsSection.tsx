import { useProfileStore } from "@/stores/profileStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow] hover:border-primary/30";

export default function PersonalDetailsSection() {
  const fullName = useProfileStore((s) => s.fullName);
  const email = useProfileStore((s) => s.email);
  const city = useProfileStore((s) => s.city);
  const country = useProfileStore((s) => s.country);
  const linkedinUrl = useProfileStore((s) => s.linkedinUrl);
  const setPersonalDetails = useProfileStore((s) => s.setPersonalDetails);

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-text-primary text-lg">
          Personal Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-text-secondary text-sm font-medium">
            Full name
          </Label>
          <Input
            className={inputClass}
            value={fullName}
            onChange={(e) => setPersonalDetails({ fullName: e.target.value })}
            placeholder="Jane Doe"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-text-secondary text-sm font-medium">
            Email
          </Label>
          <Input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setPersonalDetails({ email: e.target.value })}
            placeholder="jane.doe@example.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-sm font-medium">
              City
            </Label>
            <Input
              className={inputClass}
              value={city}
              onChange={(e) => setPersonalDetails({ city: e.target.value })}
              placeholder="Copenhagen"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-sm font-medium">
              Country
            </Label>
            <Input
              className={inputClass}
              value={country}
              onChange={(e) => setPersonalDetails({ country: e.target.value })}
              placeholder="Denmark"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-text-secondary text-sm font-medium">
            LinkedIn profile URL
          </Label>
          <Input
            className={inputClass}
            value={linkedinUrl}
            onChange={(e) =>
              setPersonalDetails({ linkedinUrl: e.target.value })
            }
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