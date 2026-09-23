/**
 * Shared helper for auto-generated field IDs (Deno edge functions).
 *
 * Fields flagged `auto: "id"` in a schema (e.g. the General Identity Card
 * `idNumber`) must be:
 *   - generated *only* at issuance time (never client-supplied), and
 *   - unique — a value is not reused across any credential ever issued.
 */

/** Random 8-or-12 digit numeric ID, zero-padded never (keeps full length via leading digit). */
export function generateIdNumber(): string {
  const length = Math.random() < 0.5 ? 8 : 12;
  let out = String(Math.floor(Math.random() * 9) + 1); // leading digit 1-9
  for (let i = 1; i < length; i++) {
    out += Math.floor(Math.random() * 10);
  }
  return out;
}

/**
 * Claim a fresh ID number that is guaranteed not to exist in any issued
 * credential. Retries up to `attempts` times.
 */
export async function allocateUniqueIdNumber(
  supabase: any,
  fieldName: string,
  attempts = 25
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const candidate = generateIdNumber();
    const { data, error } = await supabase
      .from("credentials")
      .select("id")
      .eq(`credential_data->credentialSubject->>${fieldName}`, candidate)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return candidate;
  }
  throw new Error(`Could not allocate a unique value for schema field "${fieldName}"`);
}

/**
 * Materialize auto-generated fields into `credential_data`.
 * Any schema field flagged `auto: "id"` is replaced (client-supplied values
 * are discarded) with a fresh unique ID number, allocated only at issuance.
 */
export async function resolveAutoIdFields(
  supabase: any,
  schema: any,
  credentialData: any
): Promise<Record<string, any>> {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  if (!fields.some((f: any) => f?.auto === "id")) return credentialData ?? {};

  const data: Record<string, any> = { ...(credentialData ?? {}) };
  for (const f of fields) {
    if (f?.auto === "id") {
      data[f.name] = await allocateUniqueIdNumber(supabase, f.name);
    }
  }
  return data;
}