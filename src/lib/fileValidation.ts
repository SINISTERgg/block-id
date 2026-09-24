// ── Client-side file-upload validation ──────────────────────────────────────
// Guards against oversized / wrong-type / unreadable uploads before they reach
// an API. Server-side limits still apply at the edge function layer.

export interface FileValidationOptions {
  /** Max file size in bytes. Default 2 MiB. */
  maxBytes?: number;
  /** Allowed extensions (lowercase, with or without leading dot). */
  allowedExtensions?: string[];
}

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_EXTENSIONS = ["csv", "txt", "json"];

export function getExtension(name: string): string {
  const base = name.replace(/^\.+/, "");
  const dot = base.lastIndexOf(".");
  if (dot === -1 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function validateFile(
  file: { name: string; size: number },
  options: FileValidationOptions = {}
): FileValidationResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowed = (options.allowedExtensions ?? DEFAULT_EXTENSIONS).map((e) =>
    e.toLowerCase().replace(/^\./, "")
  );

  if (!file || typeof file.name !== "string" || typeof file.size !== "number") {
    return { ok: false, error: "Invalid file" };
  }
  if (file.size <= 0) {
    return { ok: false, error: "File is empty" };
  }
  if (file.size > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return { ok: false, error: `File exceeds the ${mb} MB upload limit` };
  }
  const ext = getExtension(file.name);
  if (!allowed.includes(ext)) {
    return {
      ok: false,
      error: `Unsupported file type ".${ext || "?"}". Allowed: ${allowed.join(", ")}`,
    };
  }
  return { ok: true };
}

/** Line-count guard used before inflating a CSV/text upload into rows. */
export function validateLineCount(lines: string[], max = 500): FileValidationResult {
  if (lines.length > max) {
    return { ok: false, error: `File has ${lines.length} lines — maximum is ${max}` };
  }
  return { ok: true };
}

/** Strong holder-DID sanity check shared by CSV batch parsing paths. */
export function looksLikeDid(value: string): boolean {
  return /^did:[a-z0-9]+:.+/.test(value.trim());
}