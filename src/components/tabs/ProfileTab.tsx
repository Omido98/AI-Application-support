import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useProfileStore } from "@/stores/profileStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import PersonalDetailsSection from "@/components/profile/PersonalDetailsSection";
import EducationSection from "@/components/profile/EducationSection";
import CoverLettersSection from "@/components/profile/CoverLettersSection";
import WorkExperienceSection from "@/components/profile/WorkExperienceSection";
import OtherEngagementsSection from "@/components/profile/OtherEngagementsSection";
import CertificationsSection from "@/components/profile/CertificationsSection";
import SkillsSection from "@/components/profile/SkillsSection";
import InterestsSection from "@/components/profile/InterestsSection";
import LanguagesSection from "@/components/profile/LanguagesSection";
import {
  DEFAULT_PROFILE_SECTION_ORDER,
  PROFILE_SECTION_LABELS,
  type ProfileSectionId,
} from "@/utils/profileSections";

export default function ProfileTab() {
  const isLoaded = useProfileStore((s) => s.isLoaded);
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const sectionOrder = useSettingsStore((s) => s.profileSectionOrder);
  const setSectionOrder = useSettingsStore((s) => s.setProfileSectionOrder);

  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      loadProfile();
    }
  }, [isLoaded, loadProfile]);

  const sections: Record<ProfileSectionId, ReactNode> = {
    personal: <PersonalDetailsSection />,
    education: <EducationSection />,
    work: <WorkExperienceSection />,
    engagements: <OtherEngagementsSection />,
    certifications: <CertificationsSection />,
    skills: <SkillsSection />,
    interests: <InterestsSection />,
    languages: <LanguagesSection />,
    coverLetters: <CoverLettersSection />,
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sectionOrder.length) return;
    const next = [...sectionOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setSectionOrder(next);
  };

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-text-primary">Profile</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReordering((value) => !value)}
            aria-expanded={reordering}
          >
            {reordering ? "Done reordering" : "Reorder sections"}
          </Button>
        </div>

        {reordering && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs text-text-muted">
              Use the arrows to change section order. The order is saved and
              applies on the next start too.
            </p>
            <ul className="mt-3 space-y-1">
              {sectionOrder.map((id, index) => {
                const label = PROFILE_SECTION_LABELS[id];
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors hover:bg-field/60"
                  >
                    <span className="text-sm text-text-primary">{label}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                        onClick={() => moveSection(index, -1)}
                        aria-label={`Move ${label} up`}
                        title="Move up"
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === sectionOrder.length - 1}
                        onClick={() => moveSection(index, 1)}
                        aria-label={`Move ${label} down`}
                        title="Move down"
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setSectionOrder([...DEFAULT_PROFILE_SECTION_ORDER])}
            >
              Reset order
            </Button>
          </div>
        )}

        {sectionOrder.map((id, index) => (
          <Fragment key={id}>
            {index > 0 && <Separator className="bg-border" />}
            {sections[id]}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
