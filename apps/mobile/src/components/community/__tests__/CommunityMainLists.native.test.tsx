import { communityActivitiesQuery } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { ListActivityContext } from "@/lib/listActivity";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";
import {
  listActivity,
  listApi,
  listBoundary,
  listFixture,
  listId,
  listJson,
  listOptions,
  listPress,
  listTab,
  MainListFixture,
  scrollListEnd,
} from "../../common/ui/__tests__/mainListFixture";
import { Community } from "../Community";
import { CommunityActivities } from "../CommunityActivities";

function activityList() {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText(
    "Your network's activities",
  );
  while (node && typeof node.props.onScroll !== "function") node = node.parent;
  if (!node) throw new Error("Expected the actual native Community SectionList scroll host");
  return node;
}

it("retains the actual activity list across the marketplace tab and preserves normal tab semantics", async () => {
  await render(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  expect(await screen.findByText("First activity table")).toBeVisible();
  const list = activityList();
  await listTab("market");
  expect(screen.getByText("Coming soon")).toBeVisible();
  expect(screen.queryByText("First activity table")).toBeNull();
  await listTab("activity");
  expect(activityList()).toBe(list);
  expect(screen.getByText("First activity table")).toBeVisible();
  expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
  expect(useAppStore.getState().communityViews[JSON.stringify([listApi, "owner"])]?.tab).toBe(
    "activity",
  );
});

it("keeps selection/filter preferences isolated by account and API and restores each existing owner", async () => {
  const view = await render(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  await screen.findByText("First activity table");
  await listTab("market");
  await view.rerender(
    <MainListFixture userId="other-owner">
      <Community />
    </MainListFixture>,
  );
  expect(screen.getByTestId("top-tab-activity")).toBeSelected();
  expect(await screen.findByText("First activity table")).toBeVisible();
  await listTab("market");
  await view.rerender(
    <MainListFixture userId="other-owner" apiUrl="https://other-main-list-fixtures.test">
      <Community />
    </MainListFixture>,
  );
  expect(screen.getByTestId("top-tab-activity")).toBeSelected();
  await view.rerender(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  expect(screen.getByTestId("top-tab-market")).toBeSelected();
  expect(screen.getByText("Coming soon")).toBeVisible();
});

it("changes the activity kind through the real Select callback boundary and keeps its choice across tab visits", async () => {
  await installNativePopoverMeasurements();
  await render(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  await screen.findByText("First activity table");
  await positionMeasuredSelect(screen.getByRole("combobox", { name: "Activity type" }));
  // The Select primitive snapshots native animated opacity in Node. Exercise
  // real option callbacks without claiming physical overlay tappability.
  await fireEvent.press(
    screen.getByRole("option", { name: "Game played", includeHiddenElements: true }),
  );
  await waitFor(() =>
    expect(
      listFixture.reads.some(
        (url) =>
          url.pathname === "/api/community/activities" && url.searchParams.get("kind") === "played",
      ),
    ).toBe(true),
  );
  await listTab("market");
  await listTab("activity");
  expect(screen.getByText("Game played")).toBeVisible();
  expect(
    useAppStore.getState().communityViews[JSON.stringify([listApi, "owner"])]?.activityKind,
  ).toBe("played");
  expect(
    listFixture.reads
      .filter((url) => url.pathname === "/api/community/activities")
      .every((url) => url.searchParams.get("network") === "all"),
  ).toBe(true);
});

it("keeps unread notifications unrelated to the feed and uses the real linked narrative navigation", async () => {
  await render(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  const source = await screen.findByRole("link", { name: "First activity table" });
  await fireEvent.press(source);
  expect(listBoundary.push).toHaveBeenLastCalledWith(
    `/event/table?eventId=${listId(100)}&tableId=${listId(200)}`,
  );
  await fireEvent.press(screen.getByRole("link", { name: "network-player" }));
  expect(listBoundary.push).toHaveBeenLastCalledWith("/user/network-author");
  expect(listFixture.reads.some((url) => url.pathname.startsWith("/api/notifications"))).toBe(
    false,
  );
});

it("distinguishes initial loading, a failed read and an exhausted empty network with a deliberate retry", async () => {
  let finish: (response: Response) => void = () => {};
  listFixture.pending.set(
    "/api/community/activities",
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  await render(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  expect(screen.queryByText("No activities yet")).toBeNull();
  await act(() => finish(listJson({ error: "Unavailable" }, 503)));
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.queryByText("No activities yet")).toBeNull();
  listFixture.pending.clear();
  listFixture.activities = [];
  await listPress("Try again");
  expect(await screen.findByText("No activities yet")).toBeVisible();
});

it("retains usable cached activities on ordinary failure and revokes them after a canonical denial", async () => {
  await render(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  await screen.findByText("First activity table");
  listFixture.statuses.set("/api/community/activities", 503);
  await act(async () => {
    await listFixture.client?.invalidateQueries({ queryKey: ["profile", listApi, "owner"] });
  });
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.getByText("First activity table")).toBeVisible();
  listFixture.statuses.set("/api/community/activities", 403);
  await listPress("Try again");
  await waitFor(() => expect(screen.queryByText("First activity table")).toBeNull());
});

it("blocks visible native end events when its owning list activity is inactive, then permits paging after reactivation", async () => {
  listFixture.cursors.set("/api/community/activities", "next-activities");
  listFixture.nextActivities = [listActivity("Second activity table", listId(301))];
  const activity = { current: false };
  await render(
    <MainListFixture>
      <ListActivityContext value={activity}>
        <CommunityActivities />
      </ListActivityContext>
    </MainListFixture>,
  );
  await screen.findByText("First activity table");
  const list = activityList();
  await scrollListEnd(list);
  expect(
    listFixture.reads.filter(
      (url) => url.pathname === "/api/community/activities" && url.searchParams.has("cursor"),
    ),
  ).toHaveLength(0);
  activity.current = true;
  await scrollListEnd(list, 1264);
  expect(await screen.findByText("Second activity table")).toBeVisible();
});

it("reveals cached activity pages progressively while retaining the complete canonical snapshot", async () => {
  const key = communityActivitiesQuery(
    { ...listOptions(), getToken: async () => "fixture-list-token" },
    "all",
  ).queryKey;
  const cached = {
    pages: [
      { items: [listActivity()], nextCursor: "cached" },
      { items: [listActivity("Cached second activity", listId(302))], nextCursor: null },
    ],
    pageParams: ["", "cached"],
  };
  listFixture.client?.setQueryData(key, cached);
  await render(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  expect(screen.getByText("First activity table")).toBeVisible();
  expect(screen.queryByText("Cached second activity")).toBeNull();
  await scrollListEnd(activityList());
  expect(await screen.findByText("Cached second activity")).toBeVisible();
  expect(listFixture.client?.getQueryData(key)).toBe(cached);
  expect(
    listFixture.reads.filter((url) => url.pathname === "/api/community/activities"),
  ).toHaveLength(0);
});

it("coalesces native end events while a page is pending and requires a deliberate retry after that page fails", async () => {
  listFixture.cursors.set("/api/community/activities", "next-activities");
  listFixture.nextActivities = [listActivity("Recovered activity table", listId(303))];
  await render(
    <MainListFixture>
      <Community />
    </MainListFixture>,
  );
  await screen.findByText("First activity table");
  let finish: (response: Response) => void = () => {};
  listFixture.pending.set(
    "/api/community/activities",
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  const list = activityList();
  const pages = () =>
    listFixture.reads.filter(
      (url) => url.pathname === "/api/community/activities" && url.searchParams.has("cursor"),
    );
  await scrollListEnd(list);
  await waitFor(() => expect(pages()).toHaveLength(1));
  await scrollListEnd(list, 1264);
  expect(pages()).toHaveLength(1);
  await act(() => finish(listJson({ error: "Unavailable" }, 503)));
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  await scrollListEnd(list, 1328);
  expect(pages()).toHaveLength(1);
  listFixture.pending.clear();
  const retries = screen.getAllByRole("button", { name: "Try again" });
  await fireEvent.press(retries[retries.length - 1]);
  expect(await screen.findByText("Recovered activity table")).toBeVisible();
  expect(pages()).toHaveLength(2);
});
