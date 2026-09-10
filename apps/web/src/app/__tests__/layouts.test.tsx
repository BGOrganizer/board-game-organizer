import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TabsLayout from "@/app/(tabs)/layout";
import RootLayout from "@/app/layout";
import { renderWithI18n } from "@/test-utils";

vi.mock("next/headers", () => ({
  headers: () => ({ get: () => "en-US,en;q=0.9" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/matches",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Show: ({
    when,
    fallback,
    children,
  }: {
    when: string;
    fallback: React.ReactNode;
    children: React.ReactNode;
  }) => (when === "signed-in" ? children : fallback),
  useUser: () => ({
    isLoaded: true,
    user: { unsafeMetadata: { mobileNumber: "e2e" } },
  }),
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SignUpButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  UserButton: () => null,
}));

vi.mock("@board-game-organizer/query", () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("RootLayout", () => {
  it("sets the html lang from the Accept-Language header", async () => {
    const layout = await RootLayout({ children: <p>content</p> });
    render(layout);
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByText("content")).toBeTruthy();
  });
});

describe("TabsLayout", () => {
  it("renders the header and its children", async () => {
    renderWithI18n(await TabsLayout({ children: <p>inner</p> }));
    expect(screen.getByText("Board Game Organizer")).toBeTruthy();
    expect(screen.getByText("inner")).toBeTruthy();
  });
});
