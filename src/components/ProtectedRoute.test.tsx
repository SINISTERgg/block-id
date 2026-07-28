import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

// Mock the useAuth hook
const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderWithRouter(ui: React.ReactElement, route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("shows loading state when session is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, profileLoading: false, role: null });
    renderWithRouter(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows loading state when profile is loading for authenticated user", () => {
    mockUseAuth.mockReturnValue({ user: { id: "1" }, loading: false, profileLoading: true, role: null });
    renderWithRouter(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("redirects to /auth when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, profileLoading: false, role: null });
    renderWithRouter(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    expect(screen.queryByText("Protected")).not.toBeInTheDocument();
  });

  it("renders children when user is authenticated", () => {
    mockUseAuth.mockReturnValue({ user: { id: "1" }, loading: false, profileLoading: false, role: "holder" });
    renderWithRouter(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>);
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to / when role does not match requiredRole", () => {
    mockUseAuth.mockReturnValue({ user: { id: "1" }, loading: false, profileLoading: false, role: "holder" });
    renderWithRouter(
      <ProtectedRoute requiredRole="issuer"><div>Issuer Only</div></ProtectedRoute>
    );
    expect(screen.queryByText("Issuer Only")).not.toBeInTheDocument();
  });

  it("renders children when requiredRole matches", () => {
    mockUseAuth.mockReturnValue({ user: { id: "1" }, loading: false, profileLoading: false, role: "issuer" });
    renderWithRouter(
      <ProtectedRoute requiredRole="issuer"><div>Issuer Dashboard</div></ProtectedRoute>
    );
    expect(screen.getByText("Issuer Dashboard")).toBeInTheDocument();
  });

  it("renders children when no requiredRole is specified", () => {
    mockUseAuth.mockReturnValue({ user: { id: "1" }, loading: false, profileLoading: false, role: null });
    renderWithRouter(<ProtectedRoute><div>Any User</div></ProtectedRoute>);
    expect(screen.getByText("Any User")).toBeInTheDocument();
  });
});
