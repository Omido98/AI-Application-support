import { useEffect, useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { useChatStore } from "@/stores/chatStore";
import { sendMessage } from "@/utils/api";
import { buildBioPrompt } from "@/utils/systemPrompt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";

const textareaClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 min-h-[120px] transition-[border-color,box-shadow] hover:border-primary/30";

export default function BioSection() {
  const bio = useProfileStore((s) => s.bio);
  const setBio = useProfileStore((s) => s.setBio);

  const config = useChatStore((s) => s.config);
  const configLoaded = useChatStore((s) => s.configLoaded);
  const loadConfig = useChatStore((s) => s.loadConfig);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  const hasContent = bio.trim().length > 0;
  const hasApiKey = Boolean(config.apiKey.trim());
  const disabled = generating || hasContent || !hasApiKey;

  const handleGenerate = async () => {
    if (disabled || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await sendMessage(
        [
          {
            role: "user",
            content: "Write the bio now.",
            timestamp: new Date().toISOString(),
          },
        ],
        config,
        buildBioPrompt(useProfileStore.getState()),
      );
      if (result.error) {
        setError(result.error);
      } else if (result.content.trim()) {
        setBio(result.content.trim());
      } else {
        setError("The model returned an empty draft. Please try again.");
      }
    } catch {
      setError("Something went wrong while generating the draft.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">Bio</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          disabled={disabled}
          onClick={handleGenerate}
          title={
            hasContent
              ? "Clear the bio to regenerate a draft"
              : !hasApiKey
                ? "Connect an API key in the Chat tab to use this"
                : "Generate a draft bio"
          }
        >
          <Sparkles className="h-4 w-4 mr-1" />
          {generating ? "Generating…" : "Generate draft"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-text-muted">
          A short introduction about yourself for your CV. The AI can help you
          draft one if you have connected an API key in the Chat tab.
        </p>
        <Textarea
          className={textareaClass}
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            setError(null);
          }}
          placeholder="e.g. I am a software engineer with five years of experience building web applications..."
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}