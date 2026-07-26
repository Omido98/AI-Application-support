import { useState } from "react";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { useProfileStore } from "@/stores/profileStore";
import type { ProfileData } from "@/types";

interface InjectProfileButtonProps {
  onInject: (json: string) => void;
}

export default function InjectProfileButton({
  onInject,
}: InjectProfileButtonProps) {
  const [injected, setInjected] = useState(false);

  const education = useProfileStore((s) => s.education);
  const coverLetters = useProfileStore((s) => s.coverLetters);
  const workExperience = useProfileStore((s) => s.workExperience);
  const skills = useProfileStore((s) => s.skills);
  const languages = useProfileStore((s) => s.languages);

  const handleInject = () => {
    const profile: ProfileData = {
      education,
      coverLetters,
      workExperience,
      skills,
      languages,
    };

    // Format as pretty JSON with minimal noise
    const text =
      "Here is my full profile:\n\n```json\n" +
      JSON.stringify(profile, null, 2) +
      "\n```";

    onInject(text);
    setInjected(true);
    setTimeout(() => setInjected(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleInject}
      className="text-text-secondary hover:text-text-primary border-border"
    >
      <User className="size-3.5" />
      {injected ? "Injected!" : "Inject Profile"}
    </Button>
  );
}
