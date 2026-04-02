import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import type { SchemaFieldDef } from "@/services/api/issuer.service";

interface SchemaFieldEditorProps {
  fields: SchemaFieldDef[];
  onChange: (fields: SchemaFieldDef[]) => void;
}

const FIELD_TYPES = ["string", "number", "boolean", "date", "text"] as const;

/**
 * Reusable field-definition array editor.
 * Used in both CreateSchema and NewVersion dialogs.
 */
const SchemaFieldEditor = ({ fields, onChange }: SchemaFieldEditorProps) => {
  const addField = () => onChange([...fields, { name: "", type: "string", required: false }]);

  const removeField = (index: number) => onChange(fields.filter((_, i) => i !== index));

  const updateField = (index: number, key: keyof SchemaFieldDef, value: string | boolean) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      {fields.map((field, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="Field name"
            value={field.name}
            onChange={(e) => updateField(i, "name", e.target.value)}
            className="flex-1"
          />
          <Select value={field.type} onValueChange={(v) => updateField(i, "type", v)}>
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
      ))}
      <Button variant="outline" size="sm" onClick={addField} className="w-full gap-1">
        <Plus className="h-3 w-3" /> Add Field
      </Button>
    </div>
  );
};

export default SchemaFieldEditor;
