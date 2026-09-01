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
  useMatches: () => ({
    list: { isPending: false, isError: false, data: [] },
    create: { isError: false, mutateAsync: vi.fn(), isPending: false },
    search: { isPending: false, isError: false, mutate: vi.fn(), data: null },
    thing: { isPending: false, isError: false, mutate: vi.fn(), data: null },
  }),
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
    blocked: { data: [], isLoading: false },
    suggestions: { data: { users: [], hasContacts: false }, isLoading: false },
    follow: { mutate: vi.fn(), isPending: false },
    unfollow: { mutate: vi.fn(), isPending: false },
    block: { mutate: vi.fn(), isPending: false },
    unblock: { mutate: vi.fn(), isPending: false },
    syncContacts: { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false },
    search: { mutate: vi.fn(), data: undefined, isPending: false },
    runSearch: vi.fn(),
    refreshContacts: vi.fn(),
  }),
  useInvites: () => ({
    mutate: vi.fn(),
    isPending: false,
    data: null,
    isError: false,
    error: null,
  }),
  reportPresence: vi.fn().mockResolvedValue({ success: true }),
}));

describe("tab pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the placeholder pages without a page title (tab bar shows it)", async () => {
    renderWithI18n(await Contacts());
    expect(screen.getByText("Following")).toBeTruthy();

    const { unmount: unmountGroups } = renderWithI18n(await Groups());
    expect(screen.getByText(/coming soon/i)).toBeTruthy();
    unmountGroups();

    const { unmount: unmountOrgs } = renderWithI18n(await Organizations());
    expect(screen.getByText(/coming soon/i)).toBeTruthy();
    unmountOrgs();
  });

  it("renders the matches page with the create button", async () => {
    const { getByLabelText } = renderWithI18n(await Matches());
    expect(getByLabelText(/create a match/i)).toBeTruthy();
  });

  it("renders the profile page with the profile card", async () => {
    const { getByText, getAllByText } = renderWithI18n(await ProfilePage());
    expect(getByText("Logout")).toBeTruthy();
    // Name appears both as the heading and as the avatar fallback.
    expect(getAllByText("A").length).toBeGreaterThan(0);
  });
});
