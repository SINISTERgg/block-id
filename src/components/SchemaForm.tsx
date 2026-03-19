import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

interface SchemaField {
  name: string;
  type: string;
  required?: boolean;
}

interface SchemaFormProps {
  fields: SchemaField[];
  value: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
}

const SchemaForm = ({ fields, value, onChange }: SchemaFormProps) => {
  const handleChange = (fieldName: string, fieldValue: any) => {
    onChange({ ...value, [fieldName]: fieldValue });
  };

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
      {fields.map((field) => (
        <div key={field.name}>
          <Label htmlFor={`field-${field.name}`} className="capitalize">
            {field.name.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.type === "boolean" ? (
            <div className="flex items-center gap-2 mt-1">
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
              value={value[field.name] || ""}
              onChange={(e) => handleChange(field.name, parseFloat(e.target.value) || "")}
              required={field.required}
            />
          ) : field.type === "date" ? (
            <Input
              id={`field-${field.name}`}
              type="date"
              value={value[field.name] || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
            />
          ) : field.type === "text" || field.type === "textarea" ? (
            <Textarea
              id={`field-${field.name}`}
              value={value[field.name] || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              rows={3}
            />
          ) : (
            <Input
              id={`field-${field.name}`}
              value={value[field.name] || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default SchemaForm;
