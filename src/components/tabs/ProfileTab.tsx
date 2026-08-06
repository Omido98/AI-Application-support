import { useEffect } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { Separator } from "@/components/ui/separator";
import PersonalDetailsSection from "@/components/profile/PersonalDetailsSection";
import BioSection from "@/components/profile/BioSection";
import EducationSection from "@/components/profile/EducationSection";
import CoverLettersSection from "@/components/profile/CoverLettersSection";
import WorkExperienceSection from "@/components/profile/WorkExperienceSection";
import OtherEngagementsSection from "@/components/profile/OtherEngagementsSection";
import CertificationsSection from "@/components/profile/CertificationsSection";
import SkillsSection from "@/components/profile/SkillsSection";
import InterestsSection from "@/components/profile/InterestsSection";
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

        <PersonalDetailsSection />
        <Separator className="bg-border" />
        <BioSection />
        <Separator className="bg-border" />
        <EducationSection />
        <Separator className="bg-border" />
        <CoverLettersSection />
        <Separator className="bg-border" />
        <WorkExperienceSection />
        <Separator className="bg-border" />
        <OtherEngagementsSection />
        <Separator className="bg-border" />
        <CertificationsSection />
        <Separator className="bg-border" />
        <SkillsSection />
        <Separator className="bg-border" />
        <InterestsSection />
        <Separator className="bg-border" />
        <LanguagesSection />
      </div>
    </div>
  );
}
