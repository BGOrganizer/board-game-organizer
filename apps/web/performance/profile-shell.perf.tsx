import type {
  BggAccountResponse,
  ProfileActivity,
  ProfileView,
} from "@board-game-organizer/schemas";
import { useAppStore } from "@board-game-organizer/store";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import ProfilePage from "@/app/(tabs)/profile/page";
import UserProfilePage from "@/app/(tabs)/profiles/[userId]/page";
import { measureWebFeature } from "./featureScenario";

const session = vi.hoisted(() => ({
  userId: "profile-owner",
  apiUrl: "https://profile-shell-render.test",
  getToken: async () => "profile-fixture",
  signOut: vi.fn(async () => {}),
  back: vi.fn(),
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => session }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: session.signOut }),
  useUser: () => ({
    isLoaded: true,
    user: { id: session.userId, createdAt: new Date("2020-06-15T12:00:00.000Z") },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: session.back }) }));

const profile: ProfileView = {
  id: session.userId,
  name: "Fixture Owner",
  username: "fixture-owner",
  avatarUrl: null,
  social: { friends: 4, followers: 6, following: 2 },
  player: { gamesPlayed: 12, gamesWon: 3, winRate: 25 },
};
const activity: ProfileActivity = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "played",
  occurredAt: "2030-06-03T12:00:00Z",
  outcome: "won",
  context: "Private practice table",
  visibility: "authorized",
  href: "/events/11111111-1111-4111-8111-111111111111/tables/22222222-2222-4222-8222-222222222222",
};
const account: BggAccountResponse = {
  active: {
    id: 42,
    username: "linked-player",
    avatarUrl: null,
    snapshot: "published-snapshot",
    syncedAt: "2030-06-03T12:00:00.000Z",
  },
  pending: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  useAppStore.getState().clearProfileViews();
});

measureWebFeature(
  "Profile: switch between owned activity and player panels without losing identity",
  <ProfilePage />,
  async () => {
    const name = await screen.findByText("@fixture-owner");
    expect(name).toBeVisible();
    expect(await screen.findByRole("link", { name: "Private practice table" })).toHaveAttribute(
      "href",
      activity.href,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Player" }));
    expect(screen.getByRole("tab", { name: "Player" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Games played")).toBeVisible();
    expect(screen.getByText("25%")).toBeVisible();
    expect(screen.getByText("@fixture-owner")).toBe(name);
    fireEvent.click(screen.getByRole("tab", { name: "Activities" }));
    expect(screen.getByRole("tab", { name: "Activities" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("link", { name: "Private practice table" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeVisible();
    expect(screen.getByTestId("profile-version")).toBeVisible();
    expect(session.signOut).not.toHaveBeenCalled();
  },
  prepareProfile,
);

measureWebFeature(
  "ProfileBggCard: keep an unsent account edit through dismiss and reopen",
  <ProfilePage />,
  async () => {
    await screen.findByText("linked-player");
    const change = screen.getByRole("button", { name: "Change BGG username" });
    fireEvent.click(change);
    let dialog = within(await screen.findByRole("dialog", { name: "BGG username" }));
    const username = dialog.getByRole("textbox", { name: "BGG username" });
    expect(username).toHaveValue("linked-player");
    fireEvent.change(username, { target: { value: "unsent-player" } });
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(change);
    dialog = within(await screen.findByRole("dialog", { name: "BGG username" }));
    expect(dialog.getByRole("textbox", { name: "BGG username" })).toHaveValue("unsent-player");
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("linked-player")).toBeVisible();
  },
  prepareProfile,
);

function prepareProfile() {
  useAppStore.getState().clearProfileViews();
  session.signOut.mockClear();
  session.back.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(session.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer profile-fixture");
      expect(init?.method ?? "GET").toBe("GET");
      if (url.pathname === "/api/bgg/account") return Response.json(account);
      switch (url.pathname) {
        case `/api/profiles/${profile.id}`:
          return Response.json(profile);
        case "/api/profiles/guest":
          return Response.json({
            ...profile,
            id: "guest",
            name: "Public guest",
            username: "public-guest",
          });
        case `/api/profiles/${profile.id}/activities`:
        case "/api/profiles/guest/activities":
          return Response.json({ items: [activity], nextCursor: null });
        case `/api/profiles/${profile.id}/games`:
          return Response.json({
            items: [{ id: 1, name: "Chess", imageUrl: null }],
            nextCursor: null,
          });
        default:
          throw new Error(`Unexpected profile benchmark route: ${url.pathname}`);
      }
    }),
  );
}

measureWebFeature(
  "User profile route: preserve read-only identity and navigate back without signing out",
  () => UserProfilePage({ params: Promise.resolve({ userId: "guest" }) }),
  async () => {
    expect(await screen.findByText("@public-guest")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(session.back).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Sign out of your account" })).toBeNull();
    expect(screen.queryByText("linked-player")).toBeNull();
    expect(await screen.findByRole("link", { name: "Private practice table" })).toBeVisible();
  },
  prepareProfile,
);
