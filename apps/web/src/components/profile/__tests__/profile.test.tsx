import { useAppStore } from "@board-game-organizer/store";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { Profile } from "../Profile";
import { ProfileActivities } from "../ProfileActivities";

const m = vi.hoisted(() => ({ signOut: vi.fn(), getToken: vi.fn(async () => "fresh-token") }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    enabled: true,
    getToken: m.getToken,
  }),
}));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: m.signOut }) }));
const view = {
  id: "owner",
  name: "Alessandro",
  username: "alex",
  avatarUrl: null,
  social: { friends: 4, followers: 6, following: 2 },
  player: { gamesPlayed: 12, gamesWon: 3, winRate: 25 },
};
const active = {
  id: 1,
  username: "alice",
  avatarUrl: null,
  snapshot: "snapshot",
  syncedAt: "2030-06-03T12:00:00Z",
};
const activity = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "played",
  occurredAt: "2030-06-03T12:00:00Z",
  outcome: "won",
  context: "My Table",
  href: "/events/11111111-1111-4111-8111-111111111111/tables/22222222-2222-4222-8222-222222222222",
};
let bgg: Record<string, unknown>,
  failProfile: number,
  failGames: number,
  failLink: boolean,
  failSync: boolean,
  failFeed: boolean,
  deferredProfile: boolean,
  requests: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.getState().clearProfileViews();
  m.signOut.mockResolvedValue(undefined);
  bgg = { active: null, pending: null };
  failProfile = 0;
  failGames = 0;
  failLink = false;
  failSync = false;
  failFeed = false;
  deferredProfile = false;
  requests = vi.fn(async (url: string, init?: RequestInit) => {
    if (/\/bgg\/account$/.test(url)) {
      if (init?.method === "DELETE") bgg = { active: null, pending: null };
      if (init?.method === "POST") {
        if (failLink) return Response.json({ error: "BGG user not found" }, { status: 404 });
        const { username } = JSON.parse(String(init.body));
        bgg = {
          ...bgg,
          pending: { ...active, username, status: "syncing", error: null, nextAttemptAt: null },
          lastAttempt: { status: "syncing", at: new Date().toISOString() },
        };
      }
      return Response.json(bgg);
    }
    if (url.includes("/bgg/account/sync")) {
      bgg = failSync
        ? { ...bgg, pending: null, lastAttempt: { status: "error", at: new Date().toISOString() } }
        : {
            active,
            pending: null,
            lastAttempt: { status: "success", at: new Date().toISOString() },
          };
      return Response.json(bgg);
    }
    if (url.includes("/activities?"))
      return failFeed
        ? Response.json({ error: "Unavailable" }, { status: 503 })
        : Response.json({
            items: [activity],
            nextCursor: new URL(url).searchParams.has("cursor")
              ? null
              : `${activity.occurredAt}|${activity.id}`,
          });
    if (failGames && /\/games[/?]/.test(url))
      return Response.json({ error: "PROFILE_NOT_FOUND" }, { status: failGames });
    if (/\/games\/1/.test(url))
      return Response.json({
        game: { id: 1, name: "Chess", imageUrl: null },
        rating: 512,
        delta: 2,
        stats: { gamesPlayed: 8, gamesWon: 2, winRate: 25 },
        points: [
          { ordinal: 1, rating: 500, delta: 0 },
          { ordinal: 2, rating: 512, delta: 12 },
        ],
        nextCursor: null,
      });
    if (url.includes("/games?"))
      return Response.json({ items: [{ id: 1, name: "Chess", imageUrl: null }], nextCursor: null });
    if (deferredProfile) return new Promise<Response>(() => {});
    return failProfile
      ? Response.json({ error: "PROFILE_NOT_FOUND" }, { status: failProfile })
      : Response.json({ ...view, id: url.includes("guest") ? "guest" : "owner" });
  });
  vi.stubGlobal("fetch", requests);
});
afterEach(() => vi.unstubAllGlobals());
async function openCollection() {
  fireEvent.click(await screen.findByRole("tab", { name: "Collection" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Sync collection" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
}
async function chooseChess() {
  const trigger = await screen.findByRole("button", { name: /Board game/ });
  await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: "Chess" }));
}
it("keeps logout reachable while loading and exposes network failures with retry", async () => {
  deferredProfile = true;
  const q = renderWithI18n(<Profile />);
  expect(q.container.querySelector(".skeleton")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Sign out of your account" })).not.toBeNull();
  q.unmount();
  deferredProfile = false;
  failProfile = 503;
  renderWithI18n(<Profile />);
  await screen.findByText("Could not load profile");
  failProfile = 0;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Alessandro");
});
it("shows a compact identity, persistent tabs and real ordinal GLOBAL rating data", async () => {
  renderWithI18n(<Profile />);
  await screen.findByText("Alessandro");
  expect(screen.getByText("@alex")).not.toBeNull();
  expect(screen.queryByText("Plan:")).toBeNull();
  await screen.findByText("Recent activities");
  expect(
    screen.getByRole("link", { name: "Game played: My Table" }).getAttribute("href"),
  ).toContain("/tables/");
  fireEvent.click(screen.getByRole("tab", { name: "Player" }));
  await chooseChess();
  await screen.findByText("Current rating: 512");
  expect(screen.getByText("Last rated game change: +2")).not.toBeNull();
  expect(screen.getByRole("img", { name: "OpenSkill rating history" })).not.toBeNull();
  expect(screen.queryByText("2030-06-03")).toBeNull();
  expect(screen.getByText("Win %")).not.toBeNull();
  expect(
    useAppStore.getState().profileViews[JSON.stringify(["https://api.test", "owner", "owner"])]
      ?.tab,
  ).toBe("player");
});
it("moves BGG into the third owner-only tab and preserves tab selection through confirmation cancellation", async () => {
  renderWithI18n(<Profile />);
  await screen.findByText("Alessandro");
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toEqual([
    "Activities",
    "Player",
    "Collection",
  ]);
  expect(screen.queryByRole("heading", { name: "Your BGG collection" })).toBeNull();
  expect(requests.mock.calls.some(([url]) => url.includes("/bgg/"))).toBe(false);
  await openCollection();
  await screen.findByRole("heading", { name: "Your BGG collection" });
  fireEvent.click(screen.getByRole("button", { name: "Sign out of your account" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }),
  );
  expect(screen.getByRole("tab", { name: "Collection" }).getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(m.signOut).not.toHaveBeenCalled();
});
it("starts with an empty game selection, clears it without stale history and stays empty after remount", async () => {
  renderWithI18n(<Profile />);
  await screen.findByText("Alessandro");
  fireEvent.click(screen.getByRole("tab", { name: "Player" }));
  await waitFor(() =>
    expect(requests.mock.calls.some(([url]) => url.includes("/games?"))).toBe(true),
  );
  expect(requests.mock.calls.some(([url]) => url.includes("/games/1"))).toBe(false);
  expect(screen.queryByRole("button", { name: "Clear selected game" })).toBeNull();
  await chooseChess();
  await screen.findByText("Current rating: 512");
  fireEvent.click(screen.getByRole("button", { name: "Clear selected game" }));
  expect(screen.queryByText("Current rating: 512")).toBeNull();
  expect(screen.queryByRole("img", { name: "OpenSkill rating history" })).toBeNull();
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Clear selected game" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(screen.getByRole("tab", { name: "Activities" }));
  fireEvent.click(screen.getByRole("tab", { name: "Player" }));
  expect(screen.queryByText("Current rating: 512")).toBeNull();
  expect(
    useAppStore.getState().profileViews[JSON.stringify(["https://api.test", "owner", "owner"])]
      ?.gameId,
  ).toBeNull();
  expect(requests.mock.calls.some(([url]) => url.includes("/games/null"))).toBe(false);
});
it("quarantines all subject data after a denied child read and permits a fresh authorized retry", async () => {
  failGames = 404;
  renderWithI18n(<Profile userId="guest" />);
  await screen.findByText("Alessandro");
  fireEvent.click(screen.getByRole("tab", { name: "Player" }));
  await screen.findByText("Profile unavailable");
  expect(screen.queryByText("Alessandro")).toBeNull();
  expect(screen.queryByText("Win rate")).toBeNull();
  failGames = 0;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Alessandro");
  await chooseChess();
  await screen.findByText("Current rating: 512");
});
it("never fetches BGG or renders owner actions on another user's profile, even with stale Collection selection", async () => {
  useAppStore
    .getState()
    .setProfileView(JSON.stringify(["https://api.test", "owner", "guest"]), { tab: "collection" });
  renderWithI18n(<Profile userId="guest" />);
  await screen.findByText("Alessandro");
  expect(screen.queryByText("Your BGG collection")).toBeNull();
  expect(screen.queryByRole("tab", { name: "Collection" })).toBeNull();
  expect(screen.getByRole("tab", { name: "Activities" }).getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(screen.queryByRole("button", { name: "Sign out of your account" })).toBeNull();
  expect(requests.mock.calls.some(([url]) => url.includes("bgg"))).toBe(false);
});
it.each([401, 403, 404])("does not reveal blocked/missing profile details (%s)", async (status) => {
  failProfile = status;
  renderWithI18n(<Profile userId="guest" />);
  await screen.findByText("Profile unavailable");
  expect(screen.queryByText("Alessandro")).toBeNull();
  expect(requests.mock.calls.some(([url]) => url.includes("bgg"))).toBe(false);
});
it("asks only for a username, closes before verification, keeps failed input and validates blank submission", async () => {
  failLink = true;
  renderWithI18n(<Profile />);
  await openCollection();
  const sync = await screen.findByRole("button", { name: "Sync collection" });
  fireEvent.click(sync);
  let dialog = await screen.findByRole("dialog", { name: "BGG username" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Sync collection" }));
  expect(within(dialog).getByText("Enter a BGG username")).not.toBeNull();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "BGG username" }), {
    target: { value: "unknown" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Sync collection" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await screen.findByText(
    "Could not synchronize BGG collection. Your previous collection is retained.",
  );
  expect(
    JSON.parse(String(requests.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body)),
  ).toEqual({ username: "unknown" });
  fireEvent.click(sync);
  dialog = await screen.findByRole("dialog", { name: "BGG username" });
  expect((within(dialog).getByRole("textbox") as HTMLInputElement).value).toBe("unknown");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
});
it("retains successful collection metadata across a failed real sync and confirms unlink", async () => {
  bgg = { active, pending: null };
  failSync = true;
  renderWithI18n(<Profile />);
  await openCollection();
  await screen.findByText("alice");
  expect(
    screen.getByRole("link", { name: "Powered by BGG — open BoardGameGeek" }).getAttribute("href"),
  ).toBe("https://boardgamegeek.com");
  fireEvent.click(screen.getByRole("button", { name: "Sync collection" }));
  await screen.findByText(
    "Could not synchronize BGG collection. Your previous collection is retained.",
  );
  expect(screen.getByText("alice")).not.toBeNull();
  expect(screen.getByText("Last successful sync")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect BoardGameGeek" }));
  const dialog = await screen.findByRole("dialog", { name: "Disconnect BoardGameGeek?" });
  expect(requests.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
  await waitFor(() => expect(screen.queryByText("alice")).toBeNull());
});
it("clears prior mutation errors when a later confirmed unlink succeeds", async () => {
  bgg = { active, pending: null };
  failLink = true;
  renderWithI18n(<Profile />);
  await openCollection();
  await screen.findByText("alice");
  fireEvent.click(screen.getByRole("button", { name: "Sync collection" }));
  await screen.findByText(
    "Could not synchronize BGG collection. Your previous collection is retained.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Disconnect BoardGameGeek" }));
  const dialog = await screen.findByRole("dialog", { name: "Disconnect BoardGameGeek?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
  await waitFor(() => expect(screen.queryByText("alice")).toBeNull());
  expect(
    screen.queryByText(
      "Could not synchronize BGG collection. Your previous collection is retained.",
    ),
  ).toBeNull();
});
it("confirms logout, leaves cancellation untouched and preserves the observable failure path", async () => {
  m.signOut.mockRejectedValueOnce(new Error("unavailable"));
  renderWithI18n(<Profile />);
  const logout = screen.getByRole("button", { name: "Sign out of your account" });
  fireEvent.click(logout);
  let dialog = await screen.findByRole("dialog", { name: "Sign out of your account?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(m.signOut).not.toHaveBeenCalled();
  fireEvent.click(logout);
  dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
  await screen.findByText("Could not sign out. Try again.");
  fireEvent.click(logout);
  dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(m.signOut).toHaveBeenLastCalledWith({ redirectUrl: "/" }));
});
it("source-pages activities by ten and keeps failures separate from an empty feed", async () => {
  failFeed = true;
  renderWithI18n(<ProfileActivities userId="owner" />);
  await screen.findByText("Could not load activities");
  expect(screen.queryByText("No activities yet")).toBeNull();
  failFeed = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: "Game played: My Table" });
  const read = requests.mock.calls.find(([url]) => url.includes("/activities?"));
  expect(new URL(String(read?.[0])).searchParams.get("limit")).toBe("10");
});
