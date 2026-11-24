import { groupRecordsPageQuery } from "@board-game-organizer/shared";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, it, vi } from "vitest";
import { measureNativeList, measureNativeListCells } from "@/test/nativeListGeometry";
import {
  listApi,
  listBoundary,
  listFixture,
  listGroup,
  listId,
  listJson,
  listOptions,
  listPress,
  MainListFixture,
  scrollListEnd,
} from "../../common/ui/__tests__/mainListFixture";
import { GroupModeration } from "../GroupModeration";

const name = "Review candidate alpha";
const options = () => ({
  ...listOptions(),
  getToken: async () => "fixture-list-token",
});
const queryKey = () => groupRecordsPageQuery(options(), "moderation").queryKey;
beforeEach(() => {
  listFixture.groups = [
    listGroup(name, {
      type: "PUBLIC",
      role: "none",
      reviewStatus: "PENDING",
      canInvite: false,
      canEdit: false,
      canViewMembers: false,
      canViewEvents: false,
      canViewRankings: false,
    }),
  ];
});
const Fixture = () => (
  <MainListFixture>
    <GroupModeration />
  </MainListFixture>
);
async function measureCurrentQueue() {
  let host = screen.getByTestId("list-search-input");
  while (host.parent && typeof host.props.onScroll !== "function") host = host.parent;
  await measureNativeListCells(host);
  await measureNativeList(host, { contentHeight: 1200 });
  return host;
}

it("reads only the authorized moderation scope and navigates its real group card to the review destination", async () => {
  await render(<Fixture />);
  expect(await screen.findByText(name)).toBeVisible();
  const request = listFixture.reads.find((url) => url.pathname === "/api/groups");
  expect(request?.searchParams.get("scope")).toBe("moderation");
  expect(request?.searchParams.has("roles")).toBe(false);
  expect(request?.searchParams.has("type")).toBe(false);
  expect(listBoundary.push).not.toHaveBeenCalled();
  await listPress(`Open group: ${name}`);
  expect(listBoundary.push).toHaveBeenCalledExactlyOnceWith(`/moderation/${listId(1)}`);
});

it("keeps pending reads separate from an empty moderation queue", async () => {
  let finish: (value: Response) => void = () => {};
  listFixture.pending.set(
    "/api/groups",
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  await render(<Fixture />);
  expect(screen.queryByText("No pending reviews")).toBeNull();
  expect(screen.queryByText("Could not load moderation queue")).toBeNull();
  await act(() => finish(listJson({ items: [], nextCursor: null })));
  expect(await screen.findByText("No pending reviews")).toBeVisible();
});

it("keeps an initial queue failure observable and retries it explicitly", async () => {
  listFixture.statuses.set("/api/groups", 503);
  await render(<Fixture />);
  expect(await screen.findByText("Could not load moderation queue")).toBeVisible();
  expect(screen.queryByText("No pending reviews")).toBeNull();
  listFixture.statuses.clear();
  await listPress("Try again");
  expect(await screen.findByText(name)).toBeVisible();
});

it("keeps already-authorized cards during an ordinary background failure and removes them on denial", async () => {
  await render(<Fixture />);
  await screen.findByText(name);
  listFixture.statuses.set("/api/groups", 503);
  await act(async () => {
    await listFixture.client?.invalidateQueries({
      queryKey: queryKey(),
      exact: true,
    });
  });
  expect(await screen.findByText("Could not load moderation queue")).toBeVisible();
  expect(screen.getByText(name)).toBeVisible();
  listFixture.statuses.set("/api/groups", 403);
  await listPress("Try again");
  await waitFor(() => expect(screen.queryByText(name)).toBeNull());
  expect(screen.getByText("Could not load moderation queue")).toBeVisible();
  expect(screen.queryByText("No pending reviews")).toBeNull();
});

it("debounces discovery and sends no short text outside the authorized moderation scope", async () => {
  await render(<Fixture />);
  await screen.findByText(name);
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "Rev");
  expect(screen.getByText("Enter at least 4 characters to search")).toBeVisible();
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "candidate");
  await waitFor(() =>
    expect(listFixture.reads.some((url) => url.searchParams.get("query") === "candidate")).toBe(
      true,
    ),
  );
  expect(
    listFixture.reads
      .filter((url) => url.pathname === "/api/groups")
      .every((url) => url.searchParams.get("scope") === "moderation"),
  ).toBe(true);
  expect(listFixture.reads.some((url) => url.searchParams.get("query") === "Rev")).toBe(false);
  await userEvent.setup().press(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("");
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
});

it("preserves the canonical retained pages when the user explicitly reveals another cached review page", async () => {
  const second = listGroup("Review candidate beta", {
    id: listId(2),
    type: "PUBLIC",
    role: "none",
    reviewStatus: "PENDING",
  });
  const cache = {
    pages: [
      { items: listFixture.groups, nextCursor: "next-review" },
      { items: [second], nextCursor: null },
    ],
    pageParams: ["", "next-review"],
  };
  listFixture.client?.setQueryData(queryKey(), cache);
  await render(<Fixture />);
  expect(screen.getByText(name)).toBeVisible();
  expect(screen.queryByText(second.name)).toBeNull();
  await measureCurrentQueue();
  await listPress("Load more");
  expect(await screen.findByText(second.name)).toBeVisible();
  expect(listFixture.client?.getQueryData(queryKey())).toBe(cache);
  expect(listFixture.reads.some((url) => url.pathname === "/api/groups")).toBe(false);
});

it("replaces the explicit paging action while its real next-page read is pending and preserves both authoritative pages", async () => {
  listFixture.cursors.set("/api/groups", "next-review");
  await render(<Fixture />);
  await screen.findByText(name);
  let finish: (value: Response) => void = () => {};
  listFixture.pending.set(
    "/api/groups",
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  const list = await measureCurrentQueue();
  const action = screen.getByRole("button", { name: "Load more" });
  await listPress("Load more");
  await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
  expect(action).not.toBeOnTheScreen();
  expect(screen.getByText(name)).toBeVisible();
  expect(listFixture.client?.getQueryState(queryKey())?.fetchStatus).toBe("fetching");
  await waitFor(() =>
    expect(
      listFixture.reads.filter((url) => url.searchParams.get("cursor") === "next-review"),
    ).toHaveLength(1),
  );
  // A second genuine native gesture cannot queue another page while the
  // authoritative request is in flight; no vanished button/private callback.
  await scrollListEnd(list);
  expect(
    listFixture.reads.filter((url) => url.searchParams.get("cursor") === "next-review"),
  ).toHaveLength(1);
  listFixture.pending.clear();
  await act(() =>
    finish(
      listJson({
        items: [
          listGroup("Next review", {
            id: listId(2),
            type: "PUBLIC",
            reviewStatus: "PENDING",
          }),
        ],
        nextCursor: null,
      }),
    ),
  );
  expect(await screen.findByText("Next review")).toBeVisible();
  expect(screen.getByText(name)).toBeVisible();
  const saved = listFixture.client?.getQueryData(queryKey());
  expect(saved?.pages.map((page) => page.items.map((group) => group.name))).toEqual([
    [name],
    ["Next review"],
  ]);
});

it("reconciles an authoritative queue update without requiring the moderator to leave the screen", async () => {
  await render(<Fixture />);
  await screen.findByText(name);
  listFixture.groups = [listGroup("Revised review candidate")];
  await act(async () => {
    await listFixture.client?.invalidateQueries({
      queryKey: queryKey(),
      exact: true,
    });
  });
  expect(await screen.findByText("Revised review candidate")).toBeVisible();
  expect(screen.queryByText(name)).toBeNull();
});

it("does not reuse the previous viewer's queue after both stable account and API ownership change", async () => {
  const view = await render(<Fixture />);
  await screen.findByText(name);
  listFixture.groups = [listGroup("Another moderator queue")];
  await view.rerender(
    <MainListFixture userId="other-owner" apiUrl="https://other-main-list-fixtures.test">
      <GroupModeration />
    </MainListFixture>,
  );
  expect(screen.queryByText(name)).toBeNull();
  expect(await screen.findByText("Another moderator queue")).toBeVisible();
  expect(
    listFixture.reads.some(
      (url) => url.origin !== listApi && url.searchParams.get("scope") === "moderation",
    ),
  ).toBe(true);
});

it("does not loop a failed moderation cursor on native end events and retries that exact page only by explicit action", async () => {
  listFixture.cursors.set("/api/groups", "failed-review-cursor");
  listFixture.nextGroups = [
    listGroup("Recovered review candidate", {
      id: listId(2),
      type: "PUBLIC",
      reviewStatus: "PENDING",
    }),
  ];
  await render(<Fixture />);
  await screen.findByText(name);
  const list = await measureCurrentQueue();
  listFixture.statuses.set("/api/groups", 503);
  await listPress("Load more");
  expect(await screen.findByText("Could not load moderation queue")).toBeVisible();
  expect(screen.getByText(name)).toBeVisible();
  expect(screen.queryByText("No pending reviews")).toBeNull();
  const cursorReads = () =>
    listFixture.reads.filter((url) => url.searchParams.get("cursor") === "failed-review-cursor");
  expect(cursorReads()).toHaveLength(1);
  await scrollListEnd(list);
  expect(cursorReads()).toHaveLength(1);
  listFixture.statuses.clear();
  await listPress("Load more");
  expect(await screen.findByText("Recovered review candidate")).toBeVisible();
  expect(screen.getByText(name)).toBeVisible();
  expect(cursorReads()).toHaveLength(2);
  expect(screen.queryByText("Could not load moderation queue")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(
    listFixture.client
      ?.getQueryData(queryKey())
      ?.pages.map((page) => page.items.map((group) => group.name)),
  ).toEqual([[name], ["Recovered review candidate"]]);
  await scrollListEnd(list);
  expect(cursorReads()).toHaveLength(2);
});

it("keeps an exhausted moderation page stable after genuine repeated native end gestures", async () => {
  await render(<Fixture />);
  await screen.findByText(name);
  const list = await measureCurrentQueue();
  const initial = listFixture.client?.getQueryData(queryKey());
  const groupReads = () => listFixture.reads.filter((url) => url.pathname === "/api/groups");
  expect(groupReads()).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  await scrollListEnd(list);
  await scrollListEnd(list);
  expect(groupReads()).toHaveLength(1);
  expect(listFixture.client?.getQueryData(queryKey())).toBe(initial);
  expect(screen.getByText(name)).toBeVisible();
});

it.each(["invited", "admin", "moderator"] as const)(
  "keeps an authoritative %s review card free of membership response actions",
  async (role) => {
    listFixture.groups = [
      listGroup(name, {
        type: "PUBLIC",
        reviewStatus: "PENDING",
        role,
        canInvite: role !== "invited",
        canEdit: role !== "invited",
      }),
    ];
    await render(<Fixture />);
    expect(await screen.findByText(name)).toBeVisible();
    for (const decision of [
      "Accept",
      "Decline",
      "Accept invitation",
      "Decline invitation",
      "Request membership",
      "Cancel request",
    ])
      expect(screen.queryByRole("button", { name: decision })).toBeNull();
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    expect(listBoundary.push).not.toHaveBeenCalled();
    await listPress(`Open group: ${name}`);
    expect(listBoundary.push).toHaveBeenCalledExactlyOnceWith(`/moderation/${listId(1)}`);
    expect(
      vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
    ).toBe(true);
  },
);

it.each([
  { canViewEvents: true, eventCount: 0, visible: "0 Events" },
  { canViewEvents: true, eventCount: 1, visible: "1 Event" },
  { canViewEvents: true, eventCount: null, visible: null },
  { canViewEvents: false, eventCount: 3, visible: null },
])(
  "does not disclose unapproved or unknown group event metadata ($canViewEvents/$eventCount)",
  async ({ canViewEvents, eventCount, visible }) => {
    listFixture.groups = [
      listGroup(name, {
        type: "PUBLIC",
        reviewStatus: "PENDING",
        canViewEvents,
        eventCount,
        memberCount: 1,
      }),
    ];
    await render(<Fixture />);
    expect(await screen.findByText(name)).toBeVisible();
    expect(screen.getByText("1 Member")).toBeVisible();
    if (visible) expect(screen.getByText(visible)).toBeVisible();
    else expect(screen.queryByText(/^\d+ Events?$/)).toBeNull();
  },
);

it("loads the next authorized review page when the moderator scrolls to the end", async () => {
  listFixture.cursors.set("/api/groups", "scroll-review");
  listFixture.nextGroups = [
    listGroup("Scrolled review candidate", {
      id: listId(2),
      type: "PUBLIC",
      reviewStatus: "PENDING",
    }),
  ];
  await render(<Fixture />);
  expect(await screen.findByText(name)).toBeVisible();
  const list = await measureCurrentQueue();
  await scrollListEnd(list);
  expect(await screen.findByText("Scrolled review candidate")).toBeVisible();
  expect(screen.getByText(name)).toBeVisible();
  const requests = listFixture.reads.filter(
    (url) => url.searchParams.get("cursor") === "scroll-review",
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get("scope")).toBe("moderation");
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});
