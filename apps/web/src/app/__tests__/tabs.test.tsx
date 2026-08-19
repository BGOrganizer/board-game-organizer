import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Contacts from "@/app/(tabs)/contacts/page";
import Groups from "@/app/(tabs)/groups/page";
import Matches from "@/app/(tabs)/matches/page";
import Organizations from "@/app/(tabs)/organizations/page";
import ProfilePage from "@/app/(tabs)/profile/page";
import { renderWithI18n } from "@/test-utils";

vi.mock("next/headers", () => ({
  headers: () => ({ get: () => null }),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn().mockResolvedValue("token"),
  }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@board-game-organizer/shared", () => ({
  resolveApiUrl: (url?: string | null) => url || "http://localhost:4000",
  useProfileQuery: () => ({
    data: {
      id: "user_1",
      name: "A",
      email: "a@b.it",
      avatarUrl: "",
      preferredLanguage: "en",
      plan: "free",
      stats: { gamesOwned: 1, gamesPlayed: 2, friends: 3 },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useContacts: () => ({
    following: { data: [], isLoading: false },
    followers: { data: [], isLoading: false },
    friends: { data: [], isLoading: false },
    suggestions: { data: { users: [] }, isLoading: false },
    follow: { mutate: vi.fn(), isPending: false },
    unfollow: { mutate: vi.fn(), isPending: false },
    search: { mutate: vi.fn(), data: undefined, isPending: false },
  }),
  reportPresence: vi.fn().mockResolvedValue({ success: true }),
}));

describe("tab pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the placeholder pages with their translated headings", async () => {
    renderWithI18n(await Contacts());
    expect(screen.getByText("Contacts")).toBeTruthy();

    renderWithI18n(await Groups());
    expect(screen.getByText("Groups")).toBeTruthy();

    renderWithI18n(await Organizations());
    expect(screen.getByText("Organizations")).toBeTruthy();
  });

  it("renders the matches page with the counter", async () => {
    const { getByText } = renderWithI18n(await Matches());
    expect(getByText("Counter (Zustand)")).toBeTruthy();
  });

  it("renders the profile page with the profile card", async () => {
    const { getByText, getAllByText } = renderWithI18n(await ProfilePage());
    expect(getByText("Logout")).toBeTruthy();
    // Name appears both as the heading and as the avatar fallback.
    expect(getAllByText("A").length).toBeGreaterThan(0);
  });
});
