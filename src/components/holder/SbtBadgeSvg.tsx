/**
 * SbtBadgeSvg — SVG visual badge for a Soulbound Token.
 *
 * Each schema `credential_type` gets a distinct design:
 *   - Education / Degree / Academic  → deep blue mortar board
 *   - Employment / Work / Professional → purple briefcase
 *   - Identity / KYC / Passport       → teal shield
 *   - Certification / License         → gold/amber ribbon
 *   - Health / Medical                → red cross
 *   - Default                         → indigo badge
 *
 * The component renders an inline <svg> so it works in both the browser UI
 * and as a base64 `data:image/svg+xml` string embedded in tokenURI metadata.
 */

export interface BadgeTheme {
  label: string;
  /** Main gradient stop 1 (hex) */
  from: string;
  /** Main gradient stop 2 (hex) */
  to: string;
  /** Accent ring colour (hex) */
  accent: string;
  /** Icon path (Material-icon style SVG d attribute) */
  icon: string;
  /** Outer ring fill */
  ring: string;
}

// ── Schema-to-theme mapping ──────────────────────────────────────────────────

function iconForType(type: string | null | undefined): BadgeTheme {
  const t = (type ?? "").toLowerCase();

  if (/education|degree|diploma|academic|university|school|student|graduate/.test(t)) {
    return {
      label: "Education",
      from: "#1e3a5f",
      to: "#2563eb",
      accent: "#93c5fd",
      ring: "#1d4ed8",
      icon: "M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z",
    };
  }
  if (/employment|work|job|professional|employee|company|career|staff/.test(t)) {
    return {
      label: "Employment",
      from: "#3b1a6b",
      to: "#7c3aed",
      accent: "#c4b5fd",
      ring: "#6d28d9",
      icon: "M20 6h-2.18c.07-.43.18-.86.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .14.11.57.18 1H8c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h12c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6-3c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm6 17H8V8h12v12z",
    };
  }
  if (/identity|kyc|passport|national|id card|citizen|government|aadhaar/.test(t)) {
    return {
      label: "Identity",
      from: "#0d4040",
      to: "#0f766e",
      accent: "#5eead4",
      ring: "#0d9488",
      icon: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4c1.86 0 3.41 1.28 3.86 3H8.14C8.59 6.28 10.14 5 12 5zm0 14c-3.75 0-7-2.13-8.44-5.07A5.99 5.99 0 0112 11a5.99 5.99 0 018.44 2.93C18.99 16.87 15.73 19 12 19zm0-10c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    };
  }
  if (/certif|license|award|achiev|accredit/.test(t)) {
    return {
      label: "Certification",
      from: "#78350f",
      to: "#d97706",
      accent: "#fde68a",
      ring: "#b45309",
      icon: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V17H9v2h6v-2h-2v-1.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.86 10.4 5 9.3 5 8zm14 0c0 1.3-.86 2.4-2 2.82V7h2v1z",
    };
  }
  if (/health|medical|doctor|hospital|patient|clinic/.test(t)) {
    return {
      label: "Health",
      from: "#7f1d1d",
      to: "#dc2626",
      accent: "#fca5a5",
      ring: "#b91c1c",
      icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z",
    };
  }
  if (/membership|club|association|union/.test(t)) {
    return {
      label: "Membership",
      from: "#14532d",
      to: "#16a34a",
      accent: "#86efac",
      ring: "#15803d",
      icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    };
  }
  // Default — indigo/violet
  return {
    label: "Credential",
    from: "#1e1b4b",
    to: "#4f46e5",
    accent: "#a5b4fc",
    ring: "#4338ca",
    icon: "M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z",
  };
}

// ── Component ────────────────────────────────────────────────────────────────

interface SbtBadgeSvgProps {
  credentialType: string | null | undefined;
  schemaName: string | null | undefined;
  tokenId: number | null;
  /** px size — renders as a square */
  size?: number;
  /** If true, renders revoked state overlay */
  revoked?: boolean;
  /** Extra className on the wrapping element */
  className?: string;
}

export function SbtBadgeSvg({
  credentialType,
  schemaName,
  tokenId,
  size = 80,
  revoked = false,
  className = "",
}: SbtBadgeSvgProps) {
  const theme = iconForType(credentialType);
  const label = schemaName ?? theme.label;
  // Truncate long labels for SVG rendering
  const displayLabel = label.length > 14 ? label.slice(0, 13) + "…" : label;
  const tokenLabel = tokenId !== null ? `#${tokenId}` : "SBT";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={`${label} badge${tokenId !== null ? ` token #${tokenId}` : ""}`}
    >
      <defs>
        <linearGradient id={`bg-${tokenId ?? "x"}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={theme.from} />
          <stop offset="100%" stopColor={theme.to} />
        </linearGradient>
        <radialGradient id={`glow-${tokenId ?? "x"}`} cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor={theme.accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={theme.from} stopOpacity="0" />
        </radialGradient>
        <filter id={`shadow-${tokenId ?? "x"}`}>
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={theme.ring} floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Outer ring */}
      <circle cx="50" cy="50" r="48" fill={theme.ring} opacity="0.3" />

      {/* Main background circle */}
      <circle
        cx="50"
        cy="50"
        r="44"
        fill={`url(#bg-${tokenId ?? "x"})`}
        filter={`url(#shadow-${tokenId ?? "x"})`}
      />

      {/* Glow overlay */}
      <circle cx="50" cy="50" r="44" fill={`url(#glow-${tokenId ?? "x"})`} />

      {/* Accent ring */}
      <circle cx="50" cy="50" r="44" stroke={theme.accent} strokeWidth="1.5" strokeOpacity="0.35" fill="none" />

      {/* Inner thin ring */}
      <circle cx="50" cy="50" r="38" stroke={theme.accent} strokeWidth="0.8" strokeOpacity="0.2" fill="none" />

      {/* Icon — centred at (50,50), scaled from 24x24 Material icon path */}
      <g transform="translate(29, 25) scale(1.75)" opacity={revoked ? 0.4 : 1}>
        <path d={theme.icon} fill={theme.accent} />
      </g>

      {/* Label */}
      <text
        x="50"
        y="72"
        textAnchor="middle"
        fill={theme.accent}
        fontSize="8"
        fontWeight="600"
        fontFamily="system-ui, -apple-system, sans-serif"
        opacity={revoked ? 0.5 : 0.95}
        letterSpacing="0.3"
      >
        {displayLabel.toUpperCase()}
      </text>

      {/* Token ID chip */}
      <rect x="35" y="78" width="30" height="11" rx="5.5" fill={theme.accent} fillOpacity="0.18" />
      <text
        x="50"
        y="86.5"
        textAnchor="middle"
        fill={theme.accent}
        fontSize="6.5"
        fontFamily="monospace, Courier New"
        fontWeight="700"
        opacity={0.9}
      >
        {tokenLabel}
      </text>

      {/* Revoked overlay */}
      {revoked && (
        <>
          <line x1="20" y1="20" x2="80" y2="80" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
          <text x="50" y="54" textAnchor="middle" fill="#ef4444" fontSize="10" fontWeight="800" opacity="0.9">
            REVOKED
          </text>
        </>
      )}

      {/* Valid badge checkmark (bottom right) */}
      {!revoked && tokenId !== null && (
        <g transform="translate(72, 72)">
          <circle r="10" fill="#22c55e" />
          <path d="M-4 0 L-1.5 2.5 L4 -3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      )}
    </svg>
  );
}

/**
 * Generate a base64-encoded `data:image/svg+xml` string for the given badge.
 * Used in Supabase Edge Function / server-side token metadata generation.
 */
export function buildBadgeSvgDataUri(
  credentialType: string | null | undefined,
  schemaName: string | null | undefined,
  tokenId: number | null
): string {
  const theme = iconForType(credentialType);
  const label = schemaName ?? theme.label;
  const displayLabel = (label.length > 14 ? label.slice(0, 13) + "…" : label).toUpperCase();
  const tokenLabel = tokenId !== null ? `#${tokenId}` : "SBT";
  const tid = tokenId ?? 0;

  const svg = `<svg width="500" height="500" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg-${tid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.from}"/>
      <stop offset="100%" stop-color="${theme.to}"/>
    </linearGradient>
    <radialGradient id="glow-${tid}" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${theme.from}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow-${tid}">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${theme.ring}" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="100" height="100" fill="#0f0f1a"/>
  <circle cx="50" cy="50" r="48" fill="${theme.ring}" opacity="0.3"/>
  <circle cx="50" cy="50" r="44" fill="url(#bg-${tid})" filter="url(#shadow-${tid})"/>
  <circle cx="50" cy="50" r="44" fill="url(#glow-${tid})"/>
  <circle cx="50" cy="50" r="44" stroke="${theme.accent}" stroke-width="1.5" stroke-opacity="0.35" fill="none"/>
  <circle cx="50" cy="50" r="38" stroke="${theme.accent}" stroke-width="0.8" stroke-opacity="0.2" fill="none"/>
  <g transform="translate(29, 25) scale(1.75)">
    <path d="${theme.icon}" fill="${theme.accent}"/>
  </g>
  <text x="50" y="72" text-anchor="middle" fill="${theme.accent}" font-size="8" font-weight="600" font-family="system-ui, sans-serif" letter-spacing="0.3">${displayLabel}</text>
  <rect x="35" y="78" width="30" height="11" rx="5.5" fill="${theme.accent}" fill-opacity="0.18"/>
  <text x="50" y="86.5" text-anchor="middle" fill="${theme.accent}" font-size="6.5" font-family="monospace" font-weight="700">${tokenLabel}</text>
  <g transform="translate(72, 72)">
    <circle r="10" fill="#22c55e"/>
    <path d="M-4 0 L-1.5 2.5 L4 -3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>`;

  // btoa works in both browser and Deno
  const encoded = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(svg)))
    : Buffer.from(svg, "utf-8").toString("base64");

  return `data:image/svg+xml;base64,${encoded}`;
}

export { iconForType };
