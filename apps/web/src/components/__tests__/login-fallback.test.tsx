import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginFallback } from "@/components/LoginFallback";
import { renderWithI18n } from "@/test-utils";

vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SignUpButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

describe("LoginFallback", () => {
  it("renders the welcome copy and auth CTAs", () => {
    renderWithI18n(<LoginFallback />);
    expect(screen.getByText("Welcome to Board Game Organizer")).toBeTruthy();
    expect(screen.getByText(/Organize your board game collection/)).toBeTruthy();
    expect(screen.getAllByText("Sign In")).toHaveLength(1);
    expect(screen.getAllByText("Sign Up")).toHaveLength(1);
  });
});
