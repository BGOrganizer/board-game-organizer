import type { CommunityActivity } from "@board-game-organizer/schemas";
import { CommunityApiError } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ActivityRow } from "@/components/activities/ActivityRow";
import { renderWithI18n } from "@/test-utils";
import { Community } from "../Community";
import { CommunityActivities } from "../CommunityActivities";

const m = vi.hoisted(() => ({
  q: {} as Record<string, unknown>,
  options: { apiUrl: "https://api.test", userId: "viewer", getToken: async () => "token" },
  more: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useCommunityActivities: () => m.q,
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => m.options }));
vi.mock("@/lib/useInfiniteScroll", () => ({ useInfiniteScroll: () => () => undefined }));
const row = (
  id = "activity",
  author = { id: "friend", name: "Name", username: "friend", avatarUrl: null },
): CommunityActivity => ({
  id,
  kind: "table_join",
  occurredAt: "2030-06-03T12:00:00.000Z",
  context: "Public table",
  eventContext: "Public event",
  href: "/events/event/tables/table",
  author,
});
beforeEach(() => {
  useAppStore.setState({ communityViews: {} });
  vi.clearAllMocks();
  m.q = {
    data: undefined,
    isPending: true,
    isError: false,
    error: null,
    refetch: m.refetch,
    fetchNextPage: m.more,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  };
});
it("keeps Activities/Marketplace and the network filter scoped while navigating", async () => {
  renderWithI18n(<Community />);
  expect(screen.getByRole("heading", { name: "Community" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Marketplace" }));
  expect(screen.getByText("Coming soon")).toBeTruthy();
  expect(screen.getByText(/A place to buy, sell/)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Activities" }));
  fireEvent.click(screen.getByRole("button", { name: /Network/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Friends" }));
  expect(
    useAppStore.getState().communityViews[JSON.stringify([m.options.apiUrl, "viewer"])]?.network,
  ).toBe("friends");
  fireEvent.click(screen.getByRole("tab", { name: "Marketplace" }));
  fireEvent.click(screen.getByRole("tab", { name: "Activities" }));
  expect(screen.getByRole("button", { name: /Network/ }).textContent).toContain("Friends");
});
it("shows only server rows, public author/profile links, resource context, day groups and incremental paging", () => {
  m.q = {
    ...m.q,
    isPending: false,
    data: { pages: [{ items: [row()], nextCursor: "next" }] },
    hasNextPage: true,
  };
  const view = renderWithI18n(<CommunityActivities />);
  expect(screen.getByRole("link", { name: "friend" }).getAttribute("href")).toBe(
    "/profiles/friend",
  );
  expect(
    screen.getByRole("link", { name: "Joined a table: Public table" }).getAttribute("href"),
  ).toBe("/events/event/tables/table");
  expect(screen.getByText("Public event")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(m.more).toHaveBeenCalledOnce();
  m.q = { ...m.q, isFetchingNextPage: true };
  view.rerender(<CommunityActivities />);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  m.q = { ...m.q, isFetchingNextPage: false, isFetchNextPageError: true };
  view.rerender(<CommunityActivities />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(m.more).toHaveBeenCalledTimes(2);
});
it("distinguishes failed reads, denied cached rows and genuine empty responses", () => {
  m.q = {
    ...m.q,
    isPending: false,
    isError: true,
    error: new Error("offline"),
    data: { pages: [{ items: [row()] }] },
  };
  const view = renderWithI18n(<CommunityActivities />);
  expect(screen.getByText("Public table")).toBeTruthy();
  expect(screen.queryByText("No activities yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(m.refetch).toHaveBeenCalledOnce();
  m.q = { ...m.q, error: new CommunityApiError(403, "denied") };
  view.rerender(<CommunityActivities />);
  expect(screen.queryByText("Public table")).toBeNull();
  m.q = { ...m.q, isError: false, error: null, data: { pages: [{ items: [] }] } };
  view.rerender(<CommunityActivities />);
  expect(screen.getByText("No activities yet")).toBeTruthy();
});
it("does not nest actor/resource links and uses safe identity fallbacks", () => {
  const view = renderWithI18n(
    <ul>
      <ActivityRow
        item={row()}
        author={{ id: "safe", name: "Display", username: null, avatarUrl: null }}
      />
    </ul>,
  );
  expect(screen.getByRole("link", { name: "Display" }).querySelector("a")).toBeNull();
  view.rerender(
    <ul>
      <ActivityRow
        item={row()}
        author={{ id: "safe", name: "", username: null, avatarUrl: null }}
      />
    </ul>,
  );
  expect(screen.getByRole("link", { name: "Username unavailable" })).toBeTruthy();
});
