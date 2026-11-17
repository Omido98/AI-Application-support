import { useProfileStore } from "@/stores/profileStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow] hover:border-primary/30";

export default function PersonalDetailsSection() {
  const fullName = useProfileStore((s) => s.fullName);
  const email = useProfileStore((s) => s.email);
  const phone = useProfileStore((s) => s.phone);
  const city = useProfileStore((s) => s.city);
  const country = useProfileStore((s) => s.country);
  const linkedinUrl = useProfileStore((s) => s.linkedinUrl);
  const portfolioUrl = useProfileStore((s) => s.portfolioUrl);
  const githubUrl = useProfileStore((s) => s.githubUrl);
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
          <Label
            htmlFor="personal-full-name"
            className="text-text-secondary text-sm font-medium"
          >
            Full name
          </Label>
          <Input
            id="personal-full-name"
            className={inputClass}
            value={fullName}
            onChange={(e) => setPersonalDetails({ fullName: e.target.value })}
            placeholder="Jane Doe"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="personal-email"
            className="text-text-secondary text-sm font-medium"
          >
            Email
          </Label>
          <Input
            id="personal-email"
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setPersonalDetails({ email: e.target.value })}
            placeholder="jane.doe@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="personal-phone"
            className="text-text-secondary text-sm font-medium"
          >
            Phone
          </Label>
          <Input
            id="personal-phone"
            className={inputClass}
            type="tel"
            value={phone}
            onChange={(e) => setPersonalDetails({ phone: e.target.value })}
            placeholder="+45 12 34 56 78"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="personal-city"
              className="text-text-secondary text-sm font-medium"
            >
              City
            </Label>
            <Input
              id="personal-city"
              className={inputClass}
              value={city}
              onChange={(e) => setPersonalDetails({ city: e.target.value })}
              placeholder="Copenhagen"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="personal-country"
              className="text-text-secondary text-sm font-medium"
            >
              Country
            </Label>
            <Input
              id="personal-country"
              className={inputClass}
              value={country}
              onChange={(e) => setPersonalDetails({ country: e.target.value })}
              placeholder="Denmark"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="personal-linkedin-url"
            className="text-text-secondary text-sm font-medium"
          >
            LinkedIn profile URL
          </Label>
          <Input
            id="personal-linkedin-url"
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="personal-portfolio-url"
              className="text-text-secondary text-sm font-medium"
            >
              Portfolio / website
            </Label>
            <Input
              id="personal-portfolio-url"
              className={inputClass}
              value={portfolioUrl}
              onChange={(e) =>
                setPersonalDetails({ portfolioUrl: e.target.value })
              }
              placeholder="https://your-site.example"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="personal-github-url"
              className="text-text-secondary text-sm font-medium"
            >
              GitHub
            </Label>
            <Input
              id="personal-github-url"
              className={inputClass}
              value={githubUrl}
              onChange={(e) =>
                setPersonalDetails({ githubUrl: e.target.value })
              }
              placeholder="https://github.com/you"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
