import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { renderWithI18n } from "@/test-utils";

const { authMock, redirectMock, signedInClientMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
  signedInClientMock: { value: false },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  usePathname: () => "/",
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
  }) => ((when === "signed-in") === signedInClientMock.value ? children : fallback),
  useUser: () => ({ user: signedInClientMock.value ? { id: "user_1" } : null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SignUpButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  UserButton: () => null,
}));

describe("Home page", () => {
  it("renders the welcome screen for signed-out visitors", async () => {
    authMock.mockReturnValue({ userId: null });
    signedInClientMock.value = false;
    const page = await Home();
    renderWithI18n(page);
    expect(screen.getByText("Welcome to Board Game Organizer")).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects signed-in users to /matches", async () => {
    authMock.mockReturnValue({ userId: "user_1" });
    await Home();
    expect(redirectMock).toHaveBeenCalledWith("/matches");
  });
});
