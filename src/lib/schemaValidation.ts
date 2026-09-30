/**
 * Schema field constraint validation.
 *
 * Single source of truth for the `options` / `pattern` / `min` / `max` rules
 * declared on a `SchemaFieldDef`, shared by the single-issuance form
 * (`SchemaForm`) and the batch CSV pre-flight check so both reject the same
 * values for the same reason.
 */

export interface ConstrainedField {
  name: string;
  type: string;
  required?: boolean;
  auto?: "id" | string;
  options?: string[];
  pattern?: string;
  min?: number;
  max?: number;
  hint?: string;
}

/** Human-readable label for a field name — used in error messages. */
export function fieldLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * Validate one value against its field definition.
 * Returns `null` when valid, otherwise a human-readable error.
 */
export function validateFieldValue(field: ConstrainedField, value: unknown): string | null {
  const label = fieldLabel(field.name);

  if (isBlank(value)) {
    return field.required ? `${label} is required` : null;
  }

  if (field.options && field.options.length > 0) {
    if (!field.options.includes(String(value))) {
      return `${label} must be one of: ${field.options.join(", ")}`;
    }
  }

  if (field.pattern) {
    let re: RegExp;
    try {
      re = new RegExp(field.pattern);
    } catch {
      // An unparseable pattern in the schema must not block issuance.
      return null;
    }
    if (!re.test(String(value))) {
      return field.hint
        ? `${label}: ${field.hint}`
        : `${label} does not match the required format (${field.pattern})`;
    }
  }

  if (field.type === "number" && (typeof field.min === "number" || typeof field.max === "number")) {
    const n = Number(value);
    if (Number.isNaN(n)) return `${label} must be a number`;
    if (typeof field.min === "number" && n < field.min) return `${label} must be at least ${field.min}`;
    if (typeof field.max === "number" && n > field.max) return `${label} must be at most ${field.max}`;
  }

  return null;
}

/**
 * Validate a whole credential payload.
 * Returns a map of field name → error message; empty when the payload is valid.
 */
export function validateCredentialData(
  fields: ConstrainedField[],
  data: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields ?? []) {
    if (field.auto) continue; // allocated server-side at issuance
    const error = validateFieldValue(field, data?.[field.name]);
    if (error) errors[field.name] = error;
  }
  return errors;
}

/** Shape a `0x…` or `did:…` recipient for validation purposes. */
export function isValidHolderDid(value: string): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return true;
  return /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/.test(trimmed);
}
