export interface VerifierRequestDefaults {
  defaultPurpose: string;
  defaultType: string;
}

const DEFAULTS_KEY = "blockid:verifier:request-defaults";

export function loadRequestDefaults(): VerifierRequestDefaults {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        defaultPurpose: parsed.defaultPurpose ?? "",
        defaultType: parsed.defaultType ?? "",
      };
    }
  } catch { /* ignore */ }
  return { defaultPurpose: "", defaultType: "" };
}

export function saveRequestDefaults(defaults: VerifierRequestDefaults) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
}
