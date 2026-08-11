import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CredentialTypeSelectProps {
  value: string;
  onValueChange: (v: string) => void;
}

const CREDENTIAL_TYPES = ["degree", "diploma", "certificate", "transcript", "license", "badge", "membership", "ticket"] as const;

/**
 * Reusable select for degree / diploma / certificate / transcript.
 * Used in CreateSchema dialog and NewVersion dialog.
 */
const CredentialTypeSelect = ({ value, onValueChange }: CredentialTypeSelectProps) => (
  <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {CREDENTIAL_TYPES.map((t) => (
        <SelectItem key={t} value={t} className="capitalize">
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export default CredentialTypeSelect;
