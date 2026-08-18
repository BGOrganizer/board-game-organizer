import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";
import { renderWithI18n } from "@/test-utils";

const { useUserMock } = vi.hoisted(() => ({
  useUserMock: vi.fn<
    () => {
      user: { firstName: string; emailAddresses: { emailAddress: string }[] } | null;
    }
  >(() => ({
    user: { firstName: "Alessandro", emailAddresses: [{ emailAddress: "a@b.it" }] },
  })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/matches",
}));

vi.mock("@clerk/nextjs", () => ({
  Show: ({
    when,
    fallback,
    children,
  }: {
    when: string;
    fallback: React.ReactNode;
    children: React.ReactNode;
  }) => {
    const { user } = useUserMock();
    const signedIn = Boolean(user);
    return (when === "signed-in") === signedIn ? children : fallback;
  },
  useUser: () => useUserMock(),
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SignUpButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  UserButton: () => (
    <button type="button" aria-label="User menu">
      user
    </button>
  ),
}));

describe("Header", () => {
  it("shows the brand and the main navigation for signed-in users", () => {
    renderWithI18n(<Header />);
    expect(screen.getByText("Board Game Organizer")).toBeTruthy();
    for (const label of ["Matches", "Groups", "Organizations", "Contacts", "Profile"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Alessandro")).toBeTruthy();
    // Signed-in: no Sign In / Sign Up CTAs in the desktop bar.
    expect(screen.queryByText("Sign In")).toBeNull();
  });

  it("shows auth CTAs for signed-out users", () => {
    useUserMock.mockReturnValue({ user: null });
    renderWithI18n(<Header />);
    expect(screen.getByText("Sign In")).toBeTruthy();
    expect(screen.getByText("Sign Up")).toBeTruthy();
    expect(screen.queryByText("Alessandro")).toBeNull();
  });

  it("toggles the mobile menu", () => {
    useUserMock.mockReturnValue({ user: null });
    renderWithI18n(<Header />);
    const toggle = screen.getByRole("button", { name: "Toggle menu" });
    // Desktop CTA is always in the DOM (hidden below md) → exactly 1 when the
    // mobile menu is closed, 2 once the menu renders its own CTA.
    expect(screen.getAllByText("Sign In")).toHaveLength(1);
    fireEvent.click(toggle);
    expect(screen.getAllByText("Sign In")).toHaveLength(2);
    fireEvent.click(toggle);
    expect(screen.getAllByText("Sign In")).toHaveLength(1);
  });
});
