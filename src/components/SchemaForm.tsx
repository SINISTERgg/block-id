import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle } from "lucide-react";
import { validateFieldValue, type ConstrainedField } from "@/lib/schemaValidation";

interface SchemaFormProps {
  fields: ConstrainedField[];
  value: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
  /** Fields touched by the issuer get validated live; untouched ones stay quiet. */
  validateLive?: boolean;
}

const SchemaForm = ({ fields, value, onChange, validateLive = true }: SchemaFormProps) => {
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleChange = (fieldName: string, fieldValue: any) => {
    setTouched((t) => ({ ...t, [fieldName]: true }));
    onChange({ ...value, [fieldName]: fieldValue });
  };

  /** Error for a field, or null when the field is valid / not yet interacted with. */
  const errorFor = (field: ConstrainedField): string | null => {
    if (field.auto) return null;
    if (!touched[field.name] && !validateLive) return null;
    return validateFieldValue(field, value?.[field.name]);
  };

  const hasOptions = (field: ConstrainedField) => !!field.options && field.options.length > 0;

  const describedBy = (field: ConstrainedField) => (errorFor(field) ? `field-${field.name}-error` : undefined);

  const errorCount = (fields ?? []).filter((f) => !f.auto && !!errorFor(f)).length;

  if (!fields || fields.length === 0) {
    return (
      <div>
        <Label>Credential Data (JSON)</Label>
        <Textarea
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value)); } catch { /* ignore parse errors while typing */ }
          }}
          placeholder='{"key": "value"}'
          rows={4}
          className="font-mono text-xs"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const error = errorFor(field);
        const invalid = !!error;

        if (field.auto === "id") {
          return (
            <div key={field.name}>
              <Label htmlFor={`field-${field.name}`} className="capitalize">
                {field.name.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
              </Label>
              <div className="mt-1 pointer-events-none">
                <Input
                  id={`field-${field.name}`}
                  readOnly
                  disabled
                  value={value[field.name] ? String(value[field.name]) : ""}
                  placeholder="Auto-generated at issuance"
                  className="opacity-70"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {value[field.name]
                    ? "Allocated at issuance — unique, non-repeatable"
                    : "A random 8- or 12-digit ID is allocated when this credential is issued"}
                </p>
              </div>
            </div>
          );
        }

        return (
          <div key={field.name}>
            <Label htmlFor={`field-${field.name}`} className="capitalize">
              {field.name.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
              {field.required && !field.auto && <span className="text-destructive ml-1">*</span>}
            </Label>

            <div className="mt-1">
              {hasOptions(field) ? (
                <Select
                  value={value[field.name] ? String(value[field.name]) : ""}
                  onValueChange={(v) => handleChange(field.name, v)}
                >
                  <SelectTrigger id={`field-${field.name}`} aria-describedby={describedBy(field)} className={invalid ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select a value" />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options!.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === "boolean" ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`field-${field.name}`}
                    checked={!!value[field.name]}
                    onCheckedChange={(checked) => handleChange(field.name, checked)}
                  />
                  <label htmlFor={`field-${field.name}`} className="text-sm text-muted-foreground">Yes</label>
                </div>
              ) : field.type === "number" ? (
                <Input
                  id={`field-${field.name}`}
                  type="number"
                  value={value[field.name] ?? ""}
                  min={field.min}
                  max={field.max}
                  onChange={(e) => handleChange(field.name, e.target.value === "" ? "" : parseFloat(e.target.value))}
                  aria-describedby={describedBy(field)}
                  aria-invalid={invalid}
                  className={invalid ? "border-destructive" : ""}
                />
              ) : field.type === "date" ? (
                <Input
                  id={`field-${field.name}`}
                  type="date"
                  value={value[field.name] || ""}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  aria-describedby={describedBy(field)}
                  aria-invalid={invalid}
                  className={invalid ? "border-destructive" : ""}
                />
              ) : field.type === "text" || field.type === "textarea" ? (
                <Textarea
                  id={`field-${field.name}`}
                  value={value[field.name] || ""}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  rows={3}
                  aria-describedby={describedBy(field)}
                  aria-invalid={invalid}
                  className={invalid ? "border-destructive" : ""}
                />
              ) : (
                <Input
                  id={`field-${field.name}`}
                  value={value[field.name] || ""}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  pattern={field.pattern}
                  aria-describedby={describedBy(field)}
                  aria-invalid={invalid}
                  className={invalid ? "border-destructive" : ""}
                />
              )}
            </div>

            {error ? (
              <p id={`field-${field.name}-error`} className="flex items-center gap-1.5 text-xs text-destructive mt-1">
                <AlertCircle className="h-3 w-3 shrink-0" /> {error}
              </p>
            ) : field.hint && !invalid ? (
              <p className="text-xs text-muted-foreground mt-1">{field.hint}</p>
            ) : null}
          </div>
        );
      })}

      {errorCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-destructive border border-destructive/40 bg-destructive/10 p-2 rounded">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {errorCount} field{errorCount !== 1 ? "s" : ""} need{errorCount !== 1 ? "" : "s"} attention before issuing.
        </p>
      )}
    </div>
  );
};

export default SchemaForm;
