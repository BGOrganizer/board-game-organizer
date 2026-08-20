import type { UserProfile } from "@board-game-organizer/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Profile } from "@/components/Profile";
import { renderWithI18n } from "@/test-utils";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn().mockResolvedValue("test-token"),
  }),
  useClerk: () => ({ signOut: vi.fn().mockResolvedValue(undefined) }),
}));

const profile: UserProfile = {
  id: "user_1",
  name: "Alessandro",
  email: "a@b.it",
  avatarUrl: "https://example.com/a.png",
  preferredLanguage: "it",
  plan: "free",
  stats: { gamesOwned: 3, gamesPlayed: 12, friends: 4 },
};

const { useProfileQueryMock } = vi.hoisted(() => ({
  useProfileQueryMock: vi.fn(),
}));

vi.mock("@board-game-organizer/shared", () => ({
  resolveApiUrl: (url?: string | null) => url || "http://localhost:4000",
  useProfileQuery: () => useProfileQueryMock(),
}));

describe("Profile", () => {
  it("shows a loading state while the query is pending", () => {
    useProfileQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderWithI18n(<Profile />);
    // Loading state renders a skeleton profile card (no text).
    expect(document.querySelector('[class*="skeleton"]')).toBeTruthy();
  });

  it("shows an error state with retry when the query fails", () => {
    useProfileQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("HTTP 500"),
      refetch: vi.fn(),
    });
    renderWithI18n(<Profile />);
    expect(screen.getByText(/Error while loading the profile:/)).toBeTruthy();
    expect(screen.getByText(/HTTP 500/)).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("renders the profile data when loaded", () => {
    useProfileQueryMock.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderWithI18n(<Profile />);
    expect(screen.getByText("Alessandro")).toBeTruthy();
    expect(screen.getByText("a@b.it")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Logout")).toBeTruthy();
  });
});
