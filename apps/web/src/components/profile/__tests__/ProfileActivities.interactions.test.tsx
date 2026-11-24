import type {
  ProfileActivity,
  ProfileActivityPage,
  ProfileView,
} from "@board-game-organizer/schemas";
import { profileActivitiesQuery } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ProfileActivities } from "../ProfileActivities";
import { ProfileRecentActivities } from "../ProfileRecentActivities";

const API = "https://profile-activity-fixtures.test";
const VIEW = JSON.stringify([API, "viewer", "subject"]);
const boundary = vi.hoisted(() => ({ getToken: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://profile-activity-fixtures.test",
    userId: "viewer",
    enabled: true,
    getToken: boundary.getToken,
  }),
}));
const subject: ProfileView = {
  id: "subject",
  name: "Subject Player",
  username: "subject-player",
  avatarUrl: null,
  social: { friends: 3, followers: 2, following: 1 },
  player: { gamesPlayed: 8, gamesWon: 2, winRate: 25 },
};
const activity: ProfileActivity = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "played",
  occurredAt: "2030-06-03T12:00:00.000Z",
  outcome: "won",
  context: "Current table",
  href: "/events/public-event/tables/current-table",
  visibility: "authorized",
};
const cursor = `${activity.occurredAt}|${activity.id}`;
let page: ProfileActivityPage;
let status: number;
let pageStatus: number;
let pending: Promise<Response> | undefined;
let client: QueryClient;
const reads: URL[] = [];
const options = { apiUrl: API, userId: "viewer", enabled: true, getToken: boundary.getToken };
const json = (data: unknown, responseStatus = 200) =>
  Response.json(data, { status: responseStatus });
beforeEach(() => {
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fresh-activity-token");
  useAppStore.getState().clearProfileViews();
  page = { items: [activity], nextCursor: null };
  status = pageStatus = 200;
  pending = undefined;
  reads.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-activity-token");
      if (url.pathname === "/api/profiles/subject") return json(subject);
      if (url.pathname !== "/api/profiles/subject/activities")
        throw new Error(`Unexpected activity fixture: ${url.pathname}`);
      reads.push(url);
      if (pending) return pending;
      const responseStatus = url.searchParams.has("cursor") ? pageStatus : status;
      return json(
        responseStatus !== 200
          ? { error: "Fixture activities unavailable" }
          : url.searchParams.has("cursor")
            ? {
                items: [
                  {
                    ...activity,
                    id: "22222222-2222-4222-8222-222222222222",
                    context: "Earlier table",
                    href: "/events/public-event/tables/earlier-table",
                  },
                ],
                nextCursor: null,
              }
            : page,
        responseStatus,
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  useAppStore.getState().clearProfileViews();
  vi.unstubAllGlobals();
});
function mount(recent = false) {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      {recent ? (
        <ProfileRecentActivities userId="subject" author={subject} />
      ) : (
        <ProfileActivities userId="subject" />
      )}
    </QueryClientProvider>,
  );
}

it("does not publish an empty history before a pending response and renders the actual empty result", async () => {
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending activity request");
  };
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  mount();
  const back = screen.getByRole("link", { name: "Back" });
  expect(back).toHaveAttribute("href", "/profiles/subject");
  expect(back).toHaveTextContent("");
  expect(back.closest("[data-page-toolbar]")?.firstElementChild?.contains(back)).toBe(true);
  expect(screen.queryByText("No activities yet")).toBeNull();
  await act(() => finish(json({ items: [], nextCursor: null })));
  expect(await screen.findByText("No activities yet")).toBeVisible();
  expect(reads[0].searchParams.get("limit")).toBe("10");
});

it("ignores an obsolete stored filter and updates the authorized source through the real activity selector", async () => {
  useAppStore.getState().setProfileView(VIEW, { activityKind: "retired-filter" });
  mount();
  await screen.findByRole("link", { name: "Current table" });
  expect(reads[0].searchParams.has("kind")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /Activity type/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Game played" }));
  await waitFor(() => expect(reads.at(-1)?.searchParams.get("kind")).toBe("played"));
  expect(useAppStore.getState().profileViews[VIEW]?.activityKind).toBe("played");
  fireEvent.click(screen.getByRole("button", { name: /Activity type/ }));
  fireEvent.click(await screen.findByRole("option", { name: "All activity types" }));
  expect(useAppStore.getState().profileViews[VIEW]?.activityKind).toBe("");
  expect(screen.getByRole("link", { name: "Current table" })).toBeVisible();
});

it("retains accepted history after a failed next page and retries only that cursor through the footer action", async () => {
  page.nextCursor = cursor;
  mount();
  await screen.findByRole("link", { name: "Current table" });
  pageStatus = 503;
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.getByRole("link", { name: "Current table" })).toBeVisible();
  expect(screen.queryByText("No activities yet")).toBeNull();
  pageStatus = 200;
  const footer = screen
    .getAllByRole("button", { name: "Try again" })
    .find((button) => !button.closest('[role="alert"]'));
  if (!footer) throw new Error("Expected the failed-page footer retry action");
  fireEvent.click(footer);
  expect(await screen.findByRole("link", { name: "Earlier table" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Current table" })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(reads.map((url) => url.searchParams.get("cursor"))).toEqual([null, cursor, cursor]);
});

it("removes formerly visible activity links immediately after an authoritative denial", async () => {
  mount();
  await screen.findByRole("link", { name: "Current table" });
  status = 404;
  await act(() =>
    client.invalidateQueries({
      queryKey: profileActivitiesQuery(options, "subject", undefined, 10).queryKey,
    }),
  );
  expect(await screen.findByText("Profile unavailable")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Current table" })).toBeNull();
  expect(screen.queryByText("No activities yet")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

it("retries the recent five-item preview without confusing failure with empty and navigates only after explicit action", async () => {
  status = 503;
  mount(true);
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.queryByText("No activities yet")).toBeNull();
  expect(boundary.push).not.toHaveBeenCalled();
  status = 200;
  page = { items: [], nextCursor: null };
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No activities yet")).toBeVisible();
  expect(reads.every((url) => url.searchParams.get("limit") === "5")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "View all activities" }));
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith("/profiles/subject/activities");
});

it("shows progress while an older activity page loads and keeps existing links usable", async () => {
  page.nextCursor = cursor;
  mount();
  await screen.findByRole("link", { name: "Current table" });
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending activity cursor");
  };
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
  expect(screen.getByRole("link", { name: "Current table" })).toBeVisible();
  expect(screen.queryByText("No activities yet")).toBeNull();
  pending = undefined;
  await act(() => finish(json({ items: [], nextCursor: null })));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.getByRole("link", { name: "Current table" })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(reads.map((url) => url.searchParams.get("cursor"))).toEqual([null, cursor]);
});
