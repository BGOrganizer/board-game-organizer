import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TabsLayout from "@/app/(tabs)/layout";
import RootLayout from "@/app/layout";
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";
import { renderWithI18n } from "@/test-utils";

const request = vi.hoisted(() => ({ language: "en-US,en;q=0.9" }));
vi.mock("next/headers", () => ({
  headers: () => ({ get: () => request.language }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/matches",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/components/common/startup/WebDataWarmup", () => ({ WebDataWarmup: () => null }));
vi.mock("@/components/notifications/NotificationBell", () => ({
  NotificationBell: () => <button type="button" aria-label="Notifications" />,
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
  SignIn: () => <form aria-label="Clerk sign in" />,
  SignUp: () => <form aria-label="Clerk sign up" />,
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SignUpButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  UserButton: () => null,
  useAuth: () => ({
    userId: "user_1",
    getToken: async () => "fresh",
    isLoaded: true,
    isSignedIn: true,
  }),
}));

vi.mock("@/components/common/providers/SessionQueryProvider", () => ({
  SessionQueryProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("RootLayout", () => {
  it.each([
    ["en-US,en;q=0.9", "en"],
    ["it-IT,it;q=0.9,en;q=0.4", "it"],
  ])("sets the HTML language to %s's supported locale", async (language, locale) => {
    request.language = language;
    try {
      const layout = await RootLayout({ children: <p>content</p> });
      render(layout);
      expect(document.documentElement.lang).toBe(locale);
      expect(screen.getByText("content")).toBeVisible();
    } finally {
      request.language = "en-US,en;q=0.9";
    }
  });
});

describe("TabsLayout", () => {
  it("renders the header and its children", async () => {
    renderWithI18n(await TabsLayout({ children: <p>inner</p> }));
    expect(screen.getByText("Board Game Organizer")).toBeTruthy();
    expect(screen.getByText("inner")).toBeTruthy();
    const content = document.getElementById("tab-content-scroll");
    expect(content?.className).not.toContain("overflow-y-auto");
    expect(content?.className).not.toContain("min-h-0");
    expect(content?.className).toContain("flex-1");
    expect(content?.className).toContain("pb-28");
    expect(content?.parentElement?.className).toContain("min-h-dvh");
    expect(content?.parentElement?.className).not.toContain("overflow-hidden");
    expect(content?.parentElement?.style.height).toBe("");
    expect(document.querySelector("[data-app-header]")?.className).toContain("sticky");
    expect(document.getElementById("page-header-actions")).toBeNull();
  });
});

it.each([
  [SignInPage, "Clerk sign in", "Clerk sign up"],
  [SignUpPage, "Clerk sign up", "Clerk sign in"],
] as const)("mounts only the authentication widget for its entry point", (Page, widget, other) => {
  render(<Page />);
  expect(screen.getByRole("form", { name: widget })).toBeVisible();
  expect(screen.queryByRole("form", { name: other })).toBeNull();
});
