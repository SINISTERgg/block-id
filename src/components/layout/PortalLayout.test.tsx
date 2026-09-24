import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PortalLayout from "./PortalLayout";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock the auth hook so we don't need a real session.
const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// NotificationBell talks to Supabase — stub it out for layout tests.
vi.mock("@/components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));

const NAV_ITEMS = [
  { label: "Wallet", path: "/holder" },
  { label: "Credentials", path: "/holder/credentials" },
  { label: "Settings", path: "/holder/settings" },
];

function renderLayout(props = {}) {
  mockUseAuth.mockReturnValue({
    profile: { full_name: "Ada Lovelace", organization: "DecentraID" },
    role: "holder",
    signOut: vi.fn().mockResolvedValue(undefined),
  });
  return render(
    <MemoryRouter initialEntries={["/holder"]}>
      <TooltipProvider>
        <PortalLayout
          title="Wallet"
          portalType="holder"
          icon={<span>◆</span>}
          navItems={NAV_ITEMS}
          {...props}
        >
          <div>Portal content</div>
        </PortalLayout>
      </TooltipProvider>
    </MemoryRouter>
  );
}

// The mobile toggle is the header button whose svg is the lucide Menu/X icon.
function getMobileToggle(container: HTMLElement): HTMLButtonElement {
  const svg = container.querySelector(
    "svg.lucide-menu, svg.lucide-x"
  ) as SVGSVGElement | null;
  return svg?.closest("button") as HTMLButtonElement;
}

// The mobile drawer is inside the <header> and its numbered entries (01/02/…)
// are unique there (the desktop rail lives outside the header).
function getMobileNav(container: HTMLElement): HTMLElement {
  const header = within(document.body).getByRole("banner");
  const number = within(header).getByText("01");
  const nav = number.closest("nav");
  if (!nav) throw new Error("mobile nav not found");
  return nav as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PortalLayout mobile navigation", () => {
  it("renders content and a mobile menu toggle", () => {
    const { container } = renderLayout();
    expect(screen.getByText("Portal content")).toBeInTheDocument();
    expect(getMobileToggle(container)).toBeTruthy();
  });

  it("hides the mobile nav until the toggle is clicked", () => {
    const { container } = renderLayout();
    expect(container.querySelector("svg.lucide-menu")).toBeTruthy();
    const header = screen.getByRole("banner");
    expect(within(header).queryByText("01")).not.toBeInTheDocument();
  });

  it("reveals the numbered nav inside the mobile drawer after opening", () => {
    const { container } = renderLayout();
    fireEvent.click(getMobileToggle(container));
    const nav = getMobileNav(container);
    expect(within(nav).getByText("01")).toBeInTheDocument();
    expect(within(nav).getByText("02")).toBeInTheDocument();
    expect(within(nav).getByText("03")).toBeInTheDocument();
    // Toggle flips to the close (X) icon.
    expect(container.querySelector("svg.lucide-x")).toBeTruthy();
  });

  it("closes the mobile drawer when a nav item is clicked", () => {
    const { container } = renderLayout();
    fireEvent.click(getMobileToggle(container));
    expect(getMobileNav(container)).toBeTruthy();

    fireEvent.click(within(getMobileNav(container)).getByText("Credentials"));
    const header = screen.getByRole("banner");
    expect(within(header).queryByText("01")).not.toBeInTheDocument();
  });

  it("toggles closed when the same button is clicked again", () => {
    const { container } = renderLayout();
    fireEvent.click(getMobileToggle(container));
    expect(getMobileNav(container)).toBeTruthy();
    fireEvent.click(getMobileToggle(container));
    const header = screen.getByRole("banner");
    expect(within(header).queryByText("01")).not.toBeInTheDocument();
  });
});