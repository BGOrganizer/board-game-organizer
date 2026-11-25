// Install the SDK fixture before the native engine loads the owning components.
import "./mainListFixture";

import { communityActivitiesQuery } from "@board-game-organizer/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { expect, it } from "vitest";
import CommunityScreen from "@/app/(tabs)/community";
import EventsScreen from "@/app/(tabs)/events";
import GroupsScreen from "@/app/(tabs)/groups";
import TablesScreen from "@/app/(tabs)/tables";
import SearchGroupsScreen from "@/app/group/search";
import { CommunityActivities } from "../../../community/CommunityActivities";

import {
  listFixture,
  listGroup,
  listId,
  listOptions,
  listTab,
  MainListFixture,
  scrollListEnd,
} from "./mainListFixture";

// Complements the native owner suites with the previously unvisited Search and
// Terminated panels. Real shared queries, retained panels and RN/HeroUI hosts
// are exercised through the existing session/API adapter + strict HTTP fixture.
it("retains all three real Group list owners including the discovery draft, with only the selected owner exposed", async () => {
  await render(
    <MainListFixture>
      <GroupsScreen />
    </MainListFixture>,
  );
  await screen.findByText("Private list group");
  const privateFilter = screen.getByTestId("list-search-input");
  const privateList = screen.getByTestId("groups-scroll");
  await fireEvent.changeText(privateFilter, "Private");
  await listTab("public");
  await screen.findByText("Public list group");
  const publicFilter = screen.getByTestId("list-search-input");
  const publicList = screen.getByTestId("groups-scroll");
  await fireEvent.changeText(publicFilter, "Public");
  await listTab("search");
  const discoveryFilter = screen.getByTestId("list-search-input");
  await fireEvent.changeText(discoveryFilter, "Public");
  await screen.findByText("Public list group");
  const discoveryList = screen.getByTestId("groups-scroll");
  expect(new Set([privateList, publicList, discoveryList]).size).toBe(3);
  expect(new Set([privateFilter, publicFilter, discoveryFilter]).size).toBe(3);
  const states = [
    {
      tab: "private",
      filter: privateFilter,
      list: privateList,
      draft: "Private",
    },
    { tab: "public", filter: publicFilter, list: publicList, draft: "Public" },
    {
      tab: "search",
      filter: discoveryFilter,
      list: discoveryList,
      draft: "Public",
    },
  ];
  for (const { tab, filter, list, draft } of states) {
    await listTab(tab);
    expect(screen.getByTestId("list-search-input")).toBe(filter);
    expect(filter).toHaveDisplayValue(draft);
    expect(screen.getByTestId("groups-scroll")).toBe(list);
    expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
    expect(screen.getAllByTestId("list-search-input")).toHaveLength(1);
    expect(screen.getAllByTestId("groups-scroll")).toHaveLength(1);
  }
});

it("evicts a visited discovery owner on account and API changes without reusing its old search draft", async () => {
  const view = await render(
    <MainListFixture>
      <SearchGroupsScreen />
    </MainListFixture>,
  );
  const originalFilter = screen.getByTestId("list-search-input");
  await fireEvent.changeText(originalFilter, "Public");
  await screen.findByText("Public list group");
  const originalList = screen.getByTestId("groups-scroll");
  listFixture.groups = [listGroup("New owner discovery", { id: listId(9), type: "PUBLIC" })];
  await view.rerender(
    <MainListFixture userId="other-owner">
      <SearchGroupsScreen />
    </MainListFixture>,
  );
  const otherFilter = screen.getByTestId("list-search-input");
  expect(otherFilter).not.toBe(originalFilter);
  expect(otherFilter).toHaveDisplayValue("");
  expect(screen.queryByText("Public list group")).toBeNull();
  expect(await screen.findByText("New owner discovery")).toBeVisible();
  expect(screen.getByTestId("list-filter-friends")).toBeSelected();
  await fireEvent.changeText(otherFilter, "New owner");
  const otherList = screen.getByTestId("groups-scroll");
  expect(otherList).not.toBe(originalList);
  listFixture.groups = [listGroup("New API discovery", { id: listId(10), type: "PUBLIC" })];
  await view.rerender(
    <MainListFixture userId="other-owner" apiUrl="https://other-main-list-fixtures.test">
      <SearchGroupsScreen />
    </MainListFixture>,
  );
  expect(screen.getByTestId("list-search-input")).not.toBe(otherFilter);
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("");
  expect(screen.queryByText("New owner discovery")).toBeNull();
  expect(await screen.findByText("New API discovery")).toBeVisible();
  expect(screen.getByTestId("top-tab-search")).toBeSelected();
});

it("retains the actual terminated Event owner and its independent draft through every main Event tab", async () => {
  await render(
    <MainListFixture>
      <EventsScreen />
    </MainListFixture>,
  );
  await screen.findByText("Scheduled list event");
  const scheduledFilter = screen.getByTestId("list-search-input");
  await listTab("terminated");
  await screen.findByText("Terminated list event");
  const terminatedFilter = screen.getByTestId("list-search-input");
  const terminatedList = nativeScrollOwner(terminatedFilter);
  await fireEvent.changeText(terminatedFilter, "Terminated");
  await waitFor(() =>
    expect(
      listFixture.reads.some(
        (url) =>
          url.searchParams.get("section") === "terminated" &&
          url.searchParams.get("query") === "Terminated",
      ),
    ).toBe(true),
  );
  await listTab("available");
  await screen.findByText("Available list event");
  await listTab("mine");
  expect(screen.getByTestId("list-search-input")).toBe(scheduledFilter);
  expect(scheduledFilter).toHaveDisplayValue("");
  await listTab("terminated");
  expect(screen.getByTestId("list-search-input")).toBe(terminatedFilter);
  expect(terminatedFilter).toHaveDisplayValue("Terminated");
  expect(nativeScrollOwner(screen.getByTestId("list-search-input"))).toBe(terminatedList);
  expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
  expect(screen.queryByText("Scheduled list event")).toBeNull();
  expect(screen.queryByText("Available list event")).toBeNull();
});

function nativeScrollOwner(node: ReturnType<typeof screen.getByTestId>) {
  let current: typeof node | null = node;
  while (current && typeof current.props.onScroll !== "function") current = current.parent;
  if (!current) throw new Error("Expected actual native list scroll host");
  return current;
}
function activityList() {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText(
    "Your network's activities",
  );
  while (node && typeof node.props.onScroll !== "function") node = node.parent;
  if (!node) throw new Error("Expected actual native Community SectionList scroll host");
  return node;
}
it("keeps an exhausted real Community list from requesting another page after native end events", async () => {
  await render(
    <MainListFixture>
      <CommunityActivities />
    </MainListFixture>,
  );
  await screen.findByText("First activity table");
  const before = listFixture.reads.filter(
    (url) => url.pathname === "/api/community/activities",
  ).length;
  await scrollListEnd(activityList());
  await scrollListEnd(activityList(), 1264);
  expect(
    listFixture.reads.filter((url) => url.pathname === "/api/community/activities"),
  ).toHaveLength(before);
});
it("keeps canonical access denial observable and rejects paging even if a previous authorized page had a cursor", async () => {
  listFixture.cursors.set("/api/community/activities", "previous-private-page");
  await render(
    <MainListFixture>
      <CommunityActivities />
    </MainListFixture>,
  );
  await screen.findByText("First activity table");
  listFixture.statuses.set("/api/community/activities", 403);
  const query = communityActivitiesQuery(
    { ...listOptions(), getToken: async () => "fixture-list-token" },
    "all",
  );
  await act(async () => {
    await listFixture.client?.invalidateQueries({
      queryKey: query.queryKey,
      exact: true,
    });
  });
  expect(await screen.findByText("Could not load activities")).toBeVisible();
  expect(screen.queryByText("First activity table")).toBeNull();
  const before = listFixture.reads.filter(
    (url) => url.pathname === "/api/community/activities",
  ).length;
  await scrollListEnd(activityList());
  expect(
    listFixture.reads.filter((url) => url.pathname === "/api/community/activities"),
  ).toHaveLength(before);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

it.each([
  { section: "available", tab: "available", name: "Available list event" },
  { section: "terminated", tab: "terminated", name: "Terminated list event" },
  { section: "unrecognized", tab: "mine", name: "Scheduled list event" },
])(
  "opens the event route section $section using the authorized list",
  async ({ section, tab, name }) => {
    await render(
      <MainListFixture section={section}>
        <EventsScreen />
      </MainListFixture>,
    );
    expect(await screen.findByText(name)).toBeVisible();
    expect(screen.getByTestId(`top-tab-${tab}`)).toBeSelected();
    expect(
      listFixture.reads.some(
        (url) => url.pathname === "/api/events" && url.searchParams.get("section") === tab,
      ),
    ).toBe(true);
  },
);

it("opens the actual History tab route using game titles and the current owner's table history", async () => {
  await render(
    <MainListFixture>
      <TablesScreen />
    </MainListFixture>,
  );
  expect(
    await screen.findByRole("button", { name: "Open table: History list table" }),
  ).toBeVisible();
  expect(listFixture.reads.some((url) => url.pathname === "/api/tables")).toBe(true);
});

it("opens the actual Community tab on the network activity feed", async () => {
  await render(
    <MainListFixture>
      <CommunityScreen />
    </MainListFixture>,
  );
  expect(await screen.findByText("First activity table")).toBeVisible();
  expect(screen.getByTestId("top-tab-activity")).toBeSelected();
  expect(listFixture.reads.some((url) => url.pathname === "/api/community/activities")).toBe(true);
});
