import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IssueView from "./IssueView";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/issuer/HolderLookupInput", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="holder-did-stub" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/issuer/CertificateRenderer", () => ({
  CertificateSvg: () => <div data-testid="cert-svg" />,
  default: () => null,
}));

vi.mock("@/services/blockchain/sbt.service", () => ({
  isSbtConfigured: () => false,
}));

const schemas = [
  {
    id: "schema-1",
    name: "Employment Certificate",
    credential_type: "certificate",
    fields: [{ name: "employeeName", type: "string", required: true }],
    created_at: "2026-01-01T00:00:00Z",
    version: 1,
    parent_schema_id: null,
    is_latest: true,
  },
];

function renderIssueView(overrides: Record<string, unknown> = {}) {
  return render(
    <IssueView
      schemas={schemas}
      credentials={[]}
      walletAddress={"0x1234567890abcdef1234567890abcdef12345678"}
      isMetaMaskInstalled
      anchorTxState={null}
      revokingId={null}
      onIssue={vi.fn().mockResolvedValue(undefined)}
      onRevoke={vi.fn().mockResolvedValue(undefined)}
      onConnectWallet={vi.fn()}
      onRefresh={vi.fn()}
      {...overrides}
    />,
  );
}

/** Open the issuance dialog and return the expiration datetime-local input. */
function openDialogAndGetExpiryInput(): HTMLInputElement {
  renderIssueView();
  fireEvent.click(screen.getByText("Issue Credential"));
  const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  return input;
}

const pad = (n: number) => String(n).padStart(2, "0");

function expectedLocalInput(offset: { months?: number; years?: number }): string {
  const d = new Date();
  if (offset.months !== undefined) d.setMonth(d.getMonth() + offset.months);
  if (offset.years !== undefined) d.setFullYear(d.getFullYear() + offset.years);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe("IssueView expiration presets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fills the datetime input when +6M is clicked", () => {
    const input = openDialogAndGetExpiryInput();
    fireEvent.click(screen.getByRole("button", { name: "+6M" }));
    expect(input.value).toBe(expectedLocalInput({ months: 6 }));
  });

  it("fills the datetime input when +1Y is clicked", () => {
    const input = openDialogAndGetExpiryInput();
    fireEvent.click(screen.getByRole("button", { name: "+1Y" }));
    expect(input.value).toBe(expectedLocalInput({ years: 1 }));
  });

  it("fills the datetime input when +2Y is clicked", () => {
    const input = openDialogAndGetExpiryInput();
    fireEvent.click(screen.getByRole("button", { name: "+2Y" }));
    expect(input.value).toBe(expectedLocalInput({ years: 2 }));
  });

  it("fills the datetime input when +4Y is clicked", () => {
    const input = openDialogAndGetExpiryInput();
    fireEvent.click(screen.getByRole("button", { name: "+4Y" }));
    expect(input.value).toBe(expectedLocalInput({ years: 4 }));
  });

  it("clears the datetime input when Never is clicked", () => {
    const input = openDialogAndGetExpiryInput();
    fireEvent.click(screen.getByRole("button", { name: "+1Y" }));
    expect(input.value).not.toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Never" }));
    expect(input.value).toBe("");
  });

  it("marks the applied preset as pressed and confirms the resolved date", () => {
    const input = openDialogAndGetExpiryInput();
    fireEvent.click(screen.getByRole("button", { name: "+1Y" }));

    expect(screen.getByRole("button", { name: "+1Y" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "+2Y" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("expiry-summary").textContent).toMatch(/Expires/);
  });

  it("drops the pressed state once the issuer types their own date", () => {
    const input = openDialogAndGetExpiryInput();
    fireEvent.click(screen.getByRole("button", { name: "+1Y" }));
    fireEvent.change(input, { target: { value: "2030-01-15T09:00" } });

    expect(screen.getByRole("button", { name: "+1Y" }).getAttribute("aria-pressed")).toBe("false");
    expect(input.value).toBe("2030-01-15T09:00");
  });

  it("always produces a date in the future", () => {
    const input = openDialogAndGetExpiryInput();
    for (const label of ["+6M", "+1Y", "+2Y", "+4Y"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(new Date(input.value).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("passes the preset date through to onIssue", async () => {
    const onIssue = vi.fn().mockResolvedValue(undefined);
    renderIssueView({ onIssue });

    fireEvent.click(screen.getByText("Issue Credential"));
    fireEvent.change(screen.getByLabelText("holder-did-stub"), {
      target: { value: "did:ethr:sepolia:0xabc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+1Y" }));

    // Select the schema so the submit button is enabled. Radix Select's trigger
    // opens via keyboard, which is reliable under fireEvent.
    const trigger = screen.getByText("Select a schema");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const option = await screen.findByRole("option");
    fireEvent.click(option);

    fireEvent.click(screen.getByText("Issue & Anchor Credential"));

    await vi.waitFor(() => expect(onIssue).toHaveBeenCalled());
    const payload = onIssue.mock.calls[0][0];

    // Compared with a two-minute tolerance: the preset is resolved from `Date.now()`
    // at click time, so a clock tick mid-test would otherwise flake this assertion.
    // A genuinely wrong preset (e.g. +2Y) is off by a year and cannot slip through.
    const drift = Math.abs(
      new Date(payload.expiresAt).getTime() - new Date(expectedLocalInput({ years: 1 })).getTime(),
    );
    expect(drift).toBeLessThanOrEqual(2 * 60 * 1000);
  });
});
