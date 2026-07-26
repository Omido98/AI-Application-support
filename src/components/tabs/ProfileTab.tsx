import { useEffect } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { Separator } from "@/components/ui/separator";
import EducationSection from "@/components/profile/EducationSection";
import CoverLettersSection from "@/components/profile/CoverLettersSection";
import WorkExperienceSection from "@/components/profile/WorkExperienceSection";
import SkillsSection from "@/components/profile/SkillsSection";
import LanguagesSection from "@/components/profile/LanguagesSection";

export default function ProfileTab() {
  const isLoaded = useProfileStore((s) => s.isLoaded);
  const loadProfile = useProfileStore((s) => s.loadProfile);

  useEffect(() => {
    if (!isLoaded) {
      loadProfile();
    }
  }, [isLoaded, loadProfile]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-text-primary">Profile</h1>

        <EducationSection />
        <Separator className="bg-border" />
        <CoverLettersSection />
        <Separator className="bg-border" />
        <WorkExperienceSection />
        <Separator className="bg-border" />
        <SkillsSection />
        <Separator className="bg-border" />
        <LanguagesSection />
      </div>
    </div>
  );
}
