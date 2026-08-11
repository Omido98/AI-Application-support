import { useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus } from "lucide-react";
import type { Certification } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmDeleteDialog, {
  type DeleteTarget,
} from "@/components/profile/ConfirmDeleteDialog";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function createEmptyCertification(): Certification {
  return {
    id: crypto.randomUUID(),
    name: "",
    expiryMonth: "January",
    expiryYear: "",
  };
}

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow]";
const selectClass =
  "bg-field border border-border text-text-primary rounded-md px-3 py-1.5 text-sm appearance-none cursor-pointer transition-[border-color,box-shadow] hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary";

export default function CertificationsSection() {
  const certifications = useProfileStore((s) => s.certifications);
  const addCertification = useProfileStore((s) => s.addCertification);
  const updateCertification = useProfileStore((s) => s.updateCertification);
  const removeCertification = useProfileStore((s) => s.removeCertification);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  /** A certification with no name and no expiry year deletes without confirmation. */
  const requestDelete = (cert: Certification) => {
    if (!cert.name.trim() && !cert.expiryYear.trim()) {
      removeCertification(cert.id);
      return;
    }
    setDeleteTarget({
      label: cert.name.trim()
        ? `the certification "${cert.name.trim()}"`
        : "this certification",
      onConfirm: () => removeCertification(cert.id),
    });
  };

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">Certifications</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={() => addCertification(createEmptyCertification())}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Certification
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {certifications.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No certifications yet. Click "Add Certification" to get started.
          </p>
        )}

        {certifications.map((cert) => (
          <div
            key={cert.id}
            className="flex items-center gap-3 bg-field border border-border rounded-lg p-3 transition-[border-color] hover:border-primary/20"
          >
            <div className="grid gap-1.5 flex-1 min-w-0">
              <Label className="text-text-secondary text-xs">Certification</Label>
              <Input
                className={inputClass}
                value={cert.name}
                onChange={(e) =>
                  updateCertification(cert.id, { name: e.target.value })
                }
                placeholder="e.g. AWS Certified Solutions Architect"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-text-secondary text-xs">Expiry Month</Label>
              <select
                className={selectClass}
                value={cert.expiryMonth}
                onChange={(e) =>
                  updateCertification(cert.id, { expiryMonth: e.target.value })
                }
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 w-24">
              <Label className="text-text-secondary text-xs">Expiry Year</Label>
              <Input
                className={inputClass}
                value={cert.expiryYear}
                onChange={(e) =>
                  updateCertification(cert.id, { expiryYear: e.target.value })
                }
                placeholder="e.g. 2027"
              />
            </div>
            <button
              type="button"
              onClick={() => requestDelete(cert)}
              className="text-destructive hover:text-red-400 transition-colors shrink-0 mt-5"
              title="Remove certification"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </CardContent>
      <ConfirmDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
