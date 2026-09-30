import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import type { SchemaFieldDef } from "@/services/api/issuer.service";

interface SchemaFieldEditorProps {
  fields: SchemaFieldDef[];
  onChange: (fields: SchemaFieldDef[]) => void;
}

const FIELD_TYPES = ["string", "number", "boolean", "date", "text"] as const;

/** Common presets so issuers don't have to hand-write regexes. */
const PATTERN_PRESETS: { label: string; value: string }[] = [
  { label: "None", value: "" },
  { label: "Email", value: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
  { label: "Digits only", value: "^\\d+$" },
  { label: "Alphanumeric", value: "^[A-Za-z0-9-]+$" },
  { label: "URL", value: "^https?://\\S+$" },
  { label: "Phone (E.164)", value: "^\\+[1-9]\\d{7,14}$" },
];

/**
 * Reusable field-definition array editor.
 * Used in both CreateSchema and NewVersion dialogs.
 *
 * Each field can carry validation constraints — an option list (which also
 * switches the issuance form to a dropdown), a regex pattern and numeric bounds.
 */
const SchemaFieldEditor = ({ fields, onChange }: SchemaFieldEditorProps) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const addField = () => onChange([...fields, { name: "", type: "string", required: false }]);

  const removeField = (index: number) => onChange(fields.filter((_, i) => i !== index));

  const updateField = <K extends keyof SchemaFieldDef>(index: number, key: K, value: SchemaFieldDef[K]) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: value };
    onChange(updated);
  };

  /** Assign a type and drop constraints that no longer apply to it. */
  const setType = (index: number, type: string) => {
    const updated = [...fields];
    const numeric = type === "number";
    updated[index] = {
      ...updated[index],
      type,
      ...(numeric ? {} : { min: undefined, max: undefined }),
      ...(type === "boolean" || type === "date" ? { options: undefined, pattern: undefined } : {}),
    };
    onChange(updated);
  };

  const setOptions = (index: number, raw: string) => {
    const options = raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    updateField(index, "options", options.length > 0 ? options : undefined);
  };

  const setBound = (index: number, key: "min" | "max", raw: string) => {
    if (raw.trim() === "") {
      updateField(index, key, undefined);
      return;
    }
    const n = Number(raw);
    updateField(index, key, Number.isNaN(n) ? undefined : n);
  };

  const hasConstraints = (f: SchemaFieldDef) =>
    (!!f.options?.length || !!f.pattern || typeof f.min === "number" || typeof f.max === "number");

  return (
    <div className="space-y-2">
      {fields.map((field, i) => {
        const isOpen = expanded[i];
        return (
          <div key={i} className="border border-border bg-muted/20">
            <div className="flex items-center gap-2 p-2">
              <Input
                placeholder="Field name"
                value={field.name}
                onChange={(e) => updateField(i, "name", e.target.value)}
                className="flex-1"
              />
              <Select value={field.type} onValueChange={(v) => setType(i, v)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <Checkbox
                  checked={field.required}
                  onCheckedChange={(checked) => updateField(i, "required", !!checked)}
                />
                Req
              </label>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 shrink-0 ${hasConstraints(field) ? "text-issuer" : "text-muted-foreground"}`}
                title="Validation constraints"
                onClick={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))}
              >
                {hasConstraints(field) ? <ChevronUp className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
              </Button>
              {fields.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeField(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>

            {isOpen && (
              <div className="space-y-3 border-t border-border p-3">
                {field.type !== "boolean" && field.type !== "date" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Allowed options (comma-separated) — renders as a dropdown
                    </Label>
                    <Input
                      value={field.options?.join(", ") ?? ""}
                      onChange={(e) => setOptions(i, e.target.value)}
                      placeholder="e.g. Full-time, Part-time, Contractor"
                    />
                  </div>
                )}

                {field.type !== "boolean" && field.type !== "date" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Format pattern</Label>
                    <div className="flex gap-2">
                      <Select
                        value={field.pattern ?? ""}
                        onValueChange={(v) => updateField(i, "pattern", v || undefined)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a preset…" />
                        </SelectTrigger>
                        <SelectContent>
                          {PATTERN_PRESETS.map((p) => (
                            <SelectItem key={p.label} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={field.pattern ?? ""}
                        onChange={(e) => updateField(i, "pattern", e.target.value || undefined)}
                        placeholder="Custom regex"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                {field.type === "number" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Numeric range</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={field.min ?? ""}
                        onChange={(e) => setBound(i, "min", e.target.value)}
                        placeholder="Min"
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        value={field.max ?? ""}
                        onChange={(e) => setBound(i, "max", e.target.value)}
                        placeholder="Max"
                        className="flex-1"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Hint (shown when validation fails)</Label>
                  <Input
                    value={field.hint ?? ""}
                    onChange={(e) => updateField(i, "hint", e.target.value || undefined)}
                    placeholder="e.g. Must be a valid company email"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={addField} className="w-full gap-1">
        <Plus className="h-3 w-3" /> Add Field
      </Button>
    </div>
  );
};

export default SchemaFieldEditor;
