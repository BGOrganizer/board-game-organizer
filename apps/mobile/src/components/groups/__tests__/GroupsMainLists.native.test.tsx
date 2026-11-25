import { groupRecordMemberRoles } from "@board-game-organizer/schemas";
import { groupRecordsPageQuery } from "@board-game-organizer/shared";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { BackHandler, Keyboard } from "react-native";
import { expect, it, vi } from "vitest";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import {
  listApi,
  listBoundary,
  listChooseSortField,
  listFixture,
  listGroup,
  listId,
  listJson,
  listOptions,
  listPress,
  listTab,
  MainListFixture,
  scrollListEnd,
} from "../../common/ui/__tests__/mainListFixture";
import { Groups } from "../Groups";

it("retains independent private/public filter and native list owners while preserving one selected tab", async () => {
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  expect(await screen.findByText("Private list group")).toBeVisible();
  const privateList = screen.getByTestId("groups-scroll");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "Private");
  await waitFor(() =>
    expect(listFixture.reads.some((url) => url.searchParams.get("query") === "Private")).toBe(true),
  );
  await listTab("public");
  expect(await screen.findByText("Public list group")).toBeVisible();
  const publicList = screen.getByTestId("groups-scroll");
  expect(publicList).not.toBe(privateList);
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "Public");
  await listTab("private");
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("Private");
  expect(screen.getByTestId("groups-scroll")).toBe(privateList);
  await listTab("public");
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("Public");
  expect(screen.getByTestId("groups-scroll")).toBe(publicList);
  expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
});

it("keeps owned filtering separate and finds public groups by one character of the approved address", async () => {
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  await screen.findByText("Private list group");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "P");
  await waitFor(() =>
    expect(
      listFixture.reads.some(
        (url) => url.pathname === "/api/groups" && url.searchParams.get("query") === "P",
      ),
    ).toBe(true),
  );
  await listPress("Clear filter");
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("");
  listFixture.groups = [
    listFixture.groups[0],
    listGroup("Public list group", {
      id: listId(2),
      type: "PUBLIC",
      approved: {
        name: "Public list group",
        location: {
          id: listId(4),
          name: "Venue",
          address: "X Street",
          latitude: 41.9,
          longitude: 12.5,
        },
      },
    }),
  ];
  await listTab("search");
  expect(screen.getByRole("button", { name: "Friends" })).toBeSelected();
  expect(await screen.findByText("Public list group")).toBeVisible();
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "X");
  await waitFor(() =>
    expect(listFixture.reads.some((url) => url.searchParams.get("query") === "X")).toBe(true),
  );
  expect(await screen.findByText("Public list group")).toBeVisible();
  expect(screen.queryByText("Private list group")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create group" })).toBeNull();
});

it("passes exact role selection through owned group queries and keeps discovery free of role chips", async () => {
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  await screen.findByText("Private list group");
  for (const role of groupRecordMemberRoles)
    expect(screen.getByTestId(`list-filter-${role}`)).toBeSelected();
  await userEvent.setup().press(screen.getByRole("button", { name: "Admin", selected: true }));
  expect(await screen.findByText("No groups found")).toBeVisible();
  expect(
    listFixture.reads.some((url) => url.searchParams.get("roles") === "moderator,member,pending"),
  ).toBe(true);
  await listTab("public");
  await screen.findByText("Public list group");
  for (const role of groupRecordMemberRoles)
    expect(screen.getByTestId(`list-filter-${role}`)).toBeSelected();
  await listTab("search");
  expect(screen.queryByTestId("list-filter-administrator")).toBeNull();
  expect(screen.queryByTestId("list-filter-pending")).toBeNull();
  expect(screen.queryByTestId("list-sort-field")).toBeNull();
});

it("applies Name and direction to the owned Group source, retaining separate tab state", async () => {
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  await screen.findByText("Private list group");
  await listChooseSortField("Name");
  expect(screen.getByTestId("list-sort-field")).toHaveAccessibleName("Sort by Name");
  await listPress("Sort ascending");
  await waitFor(() =>
    expect(
      listFixture.reads.some((url) => {
        const params = url.searchParams;
        return (
          params.get("type") === "PRIVATE" &&
          params.get("sort") === "name" &&
          params.get("direction") === "asc" &&
          !params.has("cursor")
        );
      }),
    ).toBe(true),
  );
  await listTab("public");
  await screen.findByText("Public list group");
  expect(screen.getByTestId("list-sort-field")).toHaveAccessibleName("Sort by Date");
  await listTab("private");
  expect(screen.getByTestId("list-sort-field")).toHaveAccessibleName("Sort by Name");
  expect(screen.getByTestId("list-sort-direction")).toHaveAccessibleName("Sort descending");
});

it("keeps visited filters isolated by both stable account and API ownership", async () => {
  const view = await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  await screen.findByText("Private list group");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "private draft");
  listFixture.groups = [listGroup("Other owner group")];
  await view.rerender(
    <MainListFixture userId="other-owner">
      <Groups />
    </MainListFixture>,
  );
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("");
  expect(await screen.findByText("Other owner group")).toBeVisible();
  expect(screen.queryByText("Private list group")).toBeNull();
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "owner filter");
  listFixture.groups = [listGroup("Other API group")];
  await view.rerender(
    <MainListFixture apiUrl="https://other-main-list-fixtures.test" userId="other-owner">
      <Groups />
    </MainListFixture>,
  );
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("");
  expect(await screen.findByText("Other API group")).toBeVisible();
});

it("navigates through actual group and creation controls without writing or acknowledging group invitations", async () => {
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  await screen.findByText("Private list group");
  await listPress("Open group: Private list group");
  expect(listBoundary.push).toHaveBeenLastCalledWith({
    pathname: "/group/[groupId]",
    params: { groupId: listId(1) },
  });
  await listPress("Create group");
  expect(listBoundary.push).toHaveBeenLastCalledWith("/group/wizard");
});

it("distinguishes pending, failed and truly exhausted empty group lists and retries the failed read", async () => {
  let finish: (response: Response) => void = () => {};
  listFixture.pending.set(
    "/api/groups",
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  expect(screen.queryByText("No groups found")).toBeNull();
  await act(() => finish(listJson({ error: "Unavailable" }, 503)));
  expect(await screen.findByText("Could not load groups")).toBeVisible();
  expect(screen.queryByText("No groups found")).toBeNull();
  listFixture.pending.clear();
  listFixture.groups = [];
  await listPress("Try again");
  expect(await screen.findByText("No groups found")).toBeVisible();
});

it("retains usable cards through ordinary refetch errors but hides denied cached groups", async () => {
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  await screen.findByText("Private list group");
  listFixture.statuses.set("/api/groups", 503);
  await act(async () => {
    await listFixture.client?.invalidateQueries({ queryKey: ["groups", listApi, "owner"] });
  });
  expect(await screen.findByText("Could not load groups")).toBeVisible();
  expect(screen.getByText("Private list group")).toBeVisible();
  listFixture.statuses.set("/api/groups", 403);
  await listPress("Try again");
  await waitFor(() => expect(screen.queryByText("Private list group")).toBeNull());
  expect(screen.getByText("Could not load groups")).toBeVisible();
});

it("reveals retained pages progressively without mutating or refetching the authoritative cache", async () => {
  const key = groupRecordsPageQuery(
    { ...listOptions(), getToken: async () => "fixture-list-token" },
    "mine",
    "",
    groupRecordMemberRoles,
    "PRIVATE",
  ).queryKey;
  const cached = {
    pages: [
      { items: [listGroup("First retained group")], nextCursor: "retained-page" },
      { items: [listGroup("Second retained group", { id: listId(3) })], nextCursor: null },
    ],
    pageParams: ["", "retained-page"],
  };
  listFixture.client?.setQueryData(key, cached);
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  expect(screen.getByText("First retained group")).toBeVisible();
  expect(screen.queryByText("Second retained group")).toBeNull();
  await listPress("Load more");
  expect(await screen.findByText("Second retained group")).toBeVisible();
  expect(listFixture.client?.getQueryData(key)).toBe(cached);
  expect(listFixture.reads.filter((url) => url.pathname === "/api/groups")).toHaveLength(0);
});

it("pages from actual native end geometry and retains a scoped retry after next-page failure", async () => {
  listFixture.cursors.set("/api/groups", "next-groups");
  listFixture.nextGroups = [listGroup("Next group", { id: listId(4) })];
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  await screen.findByText("Private list group");
  listFixture.statuses.set("/api/groups", 503);
  await scrollListEnd(screen.getByTestId("groups-scroll"));
  expect(await screen.findByRole("button", { name: "Could not load groups. Retry" })).toBeVisible();
  expect(screen.getByText("Private list group")).toBeVisible();
  listFixture.statuses.delete("/api/groups");
  await listPress("Could not load groups. Retry");
  expect(await screen.findByText("Next group")).toBeVisible();
});

it.each([
  ["private", "Private groups", "Private groups help", /Private groups you manage/],
  ["public", "Public groups", "Public groups help", /may still be awaiting approval/],
  [
    "search",
    "Group search",
    "Group search help",
    /Search approved public groups by name or venue address/,
  ],
] as const)(
  "describes the %s Group list in the section popover",
  async (initialSection, title, label, description) => {
    await installNativePopoverMeasurements();
    await render(
      <MainListFixture>
        <Groups initialSection={initialSection} />
      </MainListFixture>,
    );
    const heading = screen.getByRole("heading", { name: title });
    expect(heading).toBeVisible();
    expect(within(heading.parent!).getByText("Section guide")).toBeVisible();
    expect(screen.queryByText(description)).toBeNull();
    await pressMeasuredPopover(screen.getByRole("button", { name: label }));
    expect(screen.getByText(description)).toBeVisible();
  },
);

it("keeps the focused input mounted, restores the native header and resets to Friends on Back", async () => {
  const dismiss = vi.spyOn(Keyboard, "dismiss");
  const remove = vi.fn();
  const back = vi.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove });
  await render(
    <MainListFixture>
      <Groups initialSection="search" />
    </MainListFixture>,
  );
  const input = screen.getByLabelText("Search groups");
  expect(screen.getByRole("heading", { name: "Group search" })).toBeVisible();
  await fireEvent(input, "focus", { nativeEvent: { target: 1 } });
  expect(screen.getByLabelText("Search groups")).toBe(input);
  expect(screen.queryByTestId("top-tab-search")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Group search" })).toBeNull();
  expect(listBoundary.setOptions).toHaveBeenLastCalledWith({ headerShown: false });
  expect(dismiss).not.toHaveBeenCalled();
  await fireEvent.changeText(input, "Public");
  await listPress("Friends");
  expect(screen.getByRole("button", { name: "Friends" })).not.toBeSelected();
  expect(await screen.findByText("Public list group")).toBeVisible();
  await listPress("Open group: Public list group");
  expect(listBoundary.push).toHaveBeenCalledWith({
    pathname: "/group/[groupId]",
    params: { groupId: listId(2) },
  });
  expect(input).toHaveDisplayValue("Public");
  const handleBack = back.mock.calls.at(-1)?.[1];
  expect(handleBack).toBeDefined();
  await act(() => {
    expect(handleBack?.({} as Parameters<NonNullable<typeof handleBack>>[0])).toBe(true);
  });
  expect(remove).toHaveBeenCalled();
  expect(dismiss).toHaveBeenCalled();
  expect(input).toHaveDisplayValue("");
  expect(listBoundary.setOptions).toHaveBeenLastCalledWith({ headerShown: true });
  expect(screen.getByRole("button", { name: "Friends" })).toBeSelected();
  expect(screen.getByTestId("top-tab-search")).toBeSelected();
  await fireEvent(input, "focus", { nativeEvent: { target: 1 } });
  await listPress("Back");
  expect(screen.getByTestId("top-tab-search")).toBeSelected();
});

it("uses Nearby with an empty query, applies both chips, and keeps Friends when location is unavailable", async () => {
  listBoundary.locationPermission
    .mockResolvedValueOnce({ granted: false, canAskAgain: true })
    .mockResolvedValueOnce({ granted: false, canAskAgain: true });
  await render(
    <MainListFixture>
      <Groups initialSection="search" />
    </MainListFixture>,
  );
  expect(listBoundary.locationPermission).not.toHaveBeenCalled();
  await listPress("Near me");
  expect(await screen.findByText("Location unavailable")).toBeVisible();
  expect(listBoundary.requestLocationPermission).toHaveBeenCalledOnce();
  expect(listBoundary.position).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Friends" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Near me" })).not.toBeSelected();
  expect(screen.queryByTestId("top-tab-search")).toBeNull();
  await listPress("Near me");
  await waitFor(() =>
    expect(
      listFixture.reads.some(
        ({ searchParams }) =>
          searchParams.get("scope") === "public" &&
          searchParams.get("friends") === "true" &&
          Number(searchParams.get("nearLat")) === 41.9 &&
          Number(searchParams.get("nearLng")) === 12.5 &&
          searchParams.get("radiusKm") === "25" &&
          !searchParams.has("query"),
      ),
    ).toBe(true),
  );
  expect(screen.getByLabelText("Search groups")).toHaveDisplayValue("");
  expect(screen.getByRole("button", { name: "Near me" })).toBeSelected();
  await listPress("Back");
  expect(screen.getByRole("button", { name: "Friends" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Near me" })).not.toBeSelected();
});

it("changes the distance with the anchored HeroUI popover and keeps it when Nearby is toggled", async () => {
  await installNativePopoverMeasurements();
  await render(
    <MainListFixture>
      <Groups initialSection="search" />
    </MainListFixture>,
  );
  expect(screen.queryByTestId("group-search-distance")).toBeNull();
  await listPress("Near me");
  const trigger = await screen.findByRole("button", { name: "Distance, 25 km" });
  await pressMeasuredPopover(trigger);
  expect(screen.getByTestId("group-distance-25")).toBeSelected();
  await fireEvent.press(screen.getByTestId("group-distance-50"));
  await waitFor(() =>
    expect(listFixture.reads.some((url) => url.searchParams.get("radiusKm") === "50")).toBe(true),
  );
  expect(listBoundary.position).toHaveBeenCalledOnce();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Distance, 50 km" }));
  await fireEvent.press(screen.getByTestId("group-distance-custom"));
  const field = screen.getByTestId("group-custom-distance");
  expect(field).toHaveDisplayValue("50");
  await fireEvent.changeText(field, "0");
  expect(screen.getByTestId("group-custom-distance-apply")).toBeDisabled();
  await fireEvent.press(screen.getByTestId("group-custom-distance-back"));
  expect(screen.getByTestId("group-distance-50")).toBeSelected();
  await fireEvent.press(screen.getByTestId("group-distance-custom"));
  await fireEvent.changeText(screen.getByTestId("group-custom-distance"), "12");
  await fireEvent.press(screen.getByTestId("group-custom-distance-apply"));
  await waitFor(() =>
    expect(listFixture.reads.some((url) => url.searchParams.get("radiusKm") === "12")).toBe(true),
  );
  await listPress("Near me");
  expect(screen.queryByTestId("group-search-distance")).toBeNull();
  await listPress("Near me");
  expect(await screen.findByRole("button", { name: "Distance, 12 km" })).toBeVisible();
});

it("shows distinct discovery empty and retry paths with the filters always available", async () => {
  listFixture.groups = [];
  await render(
    <MainListFixture>
      <Groups initialSection="search" />
    </MainListFixture>,
  );
  expect((await screen.findByText("No public groups with your friends")).parent).toHaveStyle({
    alignItems: "center",
  });
  listFixture.statuses.set("/api/groups", 503);
  await listPress("Friends");
  expect(await screen.findByText("Could not load groups")).toBeVisible();
  expect(screen.queryByText("No groups found")).toBeNull();
  listFixture.statuses.delete("/api/groups");
  await listPress("Try again");
  expect((await screen.findByText("No groups found")).parent).toHaveStyle({ alignItems: "center" });
});

it("keeps the first group page usable while suppressing repeated requests for the pending next cursor", async () => {
  const cursor = "pending-groups";
  listFixture.cursors.set("/api/groups", cursor);
  await render(
    <MainListFixture>
      <Groups />
    </MainListFixture>,
  );
  expect(await screen.findByText("Private list group")).toBeVisible();
  let finish!: (response: Response) => void;
  listFixture.pending.set(
    "/api/groups",
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const nextReads = () =>
    listFixture.reads.filter(
      (url) => url.pathname === "/api/groups" && url.searchParams.get("cursor") === cursor,
    );
  const list = screen.getByTestId("groups-scroll");
  await scrollListEnd(list);
  await waitFor(() => expect(nextReads()).toHaveLength(1));
  expect(screen.getByText("Private list group")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  await scrollListEnd(list);
  expect(nextReads()).toHaveLength(1);

  await act(() => {
    listFixture.pending.delete("/api/groups");
    finish(
      listJson({
        items: [listGroup("Next authorized group", { id: listId(4) })],
        nextCursor: null,
      }),
    );
  });
  expect(await screen.findByText("Next authorized group")).toBeVisible();
  expect(screen.getByText("Private list group")).toBeVisible();
});
