import { eventRecordsQuery } from "@board-game-organizer/shared";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { expect, it } from "vitest";
import {
  listApi,
  listBoundary,
  listEvent,
  listFixture,
  listId,
  listJson,
  listOptions,
  listPress,
  listTab,
  MainListFixture,
} from "../../common/ui/__tests__/mainListFixture";
import { Events } from "../Events";

it("retains independently filtered scheduled/available/terminated native list owners and their selected semantics", async () => {
  await render(
    <MainListFixture>
      <Events />
    </MainListFixture>,
  );
  expect(await screen.findByText("Scheduled list event")).toBeVisible();
  const scheduledFilter = screen.getByTestId("list-search-input");
  await fireEvent.changeText(scheduledFilter, "Scheduled");
  await listTab("available");
  expect(await screen.findByText("Available list event")).toBeVisible();
  const availableFilter = screen.getByTestId("list-search-input");
  await fireEvent.changeText(availableFilter, "Available");
  await listTab("terminated");
  expect(await screen.findByText("Terminated list event")).toBeVisible();
  await listTab("mine");
  expect(screen.getByTestId("list-search-input")).toBe(scheduledFilter);
  expect(scheduledFilter).toHaveDisplayValue("Scheduled");
  await listTab("available");
  expect(screen.getByTestId("list-search-input")).toBe(availableFilter);
  expect(availableFilter).toHaveDisplayValue("Available");
  expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
  expect(screen.queryByTestId("list-filter-PLANNING")).toBeNull();
});

it("uses short debounced scoped filters rather than discovery and clears back to its authorized section", async () => {
  await render(
    <MainListFixture>
      <Events />
    </MainListFixture>,
  );
  await screen.findByText("Scheduled list event");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "S");
  await waitFor(() =>
    expect(
      listFixture.reads.some(
        (url) =>
          url.pathname === "/api/events" &&
          url.searchParams.get("query") === "S" &&
          url.searchParams.get("section") === "mine",
      ),
    ).toBe(true),
  );
  await listPress("Clear filter");
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("");
  expect(screen.queryByText("Available list event")).toBeNull();
});

it("keeps group-context events in their real detail list with header, status filters and creation capability", async () => {
  const groupId = listId(1);
  listFixture.events = [listEvent("Group planned event", { groupId, groupType: "PRIVATE" })];
  await render(
    <MainListFixture>
      <Events groupId={groupId} canCreate={false} header={<Text>Group detail header</Text>} />
    </MainListFixture>,
  );
  expect(await screen.findByText("Group planned event")).toBeVisible();
  expect(screen.getByText("Group detail header")).toBeVisible();
  expect(screen.queryByTestId("top-tab-mine")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create event" })).toBeNull();
  expect(screen.getByTestId("list-filter-PLANNING")).toBeSelected();
  await userEvent.setup().press(screen.getByRole("button", { name: "Planning", selected: true }));
  expect(await screen.findByText("No events found")).toBeVisible();
  expect(
    listFixture.reads
      .filter((url) => url.pathname === "/api/events")
      .every(
        (url) => url.searchParams.get("groupId") === groupId && !url.searchParams.has("section"),
      ),
  ).toBe(true);
});

it("routes group-context creation through the actual group ID and leaves standalone creation unscoped", async () => {
  const view = await render(
    <MainListFixture>
      <Events groupId={listId(1)} />
    </MainListFixture>,
  );
  await listPress("Create event");
  expect(listBoundary.push).toHaveBeenLastCalledWith({
    pathname: "/event/wizard",
    params: { groupId: listId(1) },
  });
  await view.unmount();
  await render(
    <MainListFixture>
      <Events />
    </MainListFixture>,
  );
  await listPress("Create event");
  expect(listBoundary.push).toHaveBeenLastCalledWith({ pathname: "/event/wizard", params: {} });
});

it("remounts private list state on account/API changes while consuming fresh authoritative rows", async () => {
  const view = await render(
    <MainListFixture>
      <Events />
    </MainListFixture>,
  );
  await screen.findByText("Scheduled list event");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "unsaved owner filter");
  listFixture.events = [listEvent("Other owner event")];
  await view.rerender(
    <MainListFixture userId="other-owner">
      <Events />
    </MainListFixture>,
  );
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("");
  expect(await screen.findByText("Other owner event")).toBeVisible();
  listFixture.events = [listEvent("Other API event")];
  await view.rerender(
    <MainListFixture userId="other-owner" apiUrl="https://other-main-list-fixtures.test">
      <Events />
    </MainListFixture>,
  );
  expect(await screen.findByText("Other API event")).toBeVisible();
  expect(screen.queryByText("Other owner event")).toBeNull();
});

it("keeps pending event reads distinct from failed and genuinely empty sections", async () => {
  let finish: (response: Response) => void = () => {};
  listFixture.pending.set(
    "/api/events",
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  await render(
    <MainListFixture>
      <Events />
    </MainListFixture>,
  );
  expect(screen.queryByText("No events found")).toBeNull();
  await act(() => finish(listJson({ error: "Unavailable" }, 503)));
  expect(await screen.findByText("Could not load events")).toBeVisible();
  expect(screen.queryByText("No events found")).toBeNull();
  listFixture.pending.clear();
  listFixture.events = [];
  await listPress("Try again");
  expect(await screen.findByText("No events found")).toBeVisible();
});

it("retains cached event cards on a failed refresh and removes them after an authorization denial", async () => {
  await render(
    <MainListFixture>
      <Events />
    </MainListFixture>,
  );
  await screen.findByText("Scheduled list event");
  listFixture.statuses.set("/api/events", 503);
  await act(async () => {
    await listFixture.client?.invalidateQueries({ queryKey: ["events", listApi, "owner"] });
  });
  expect(await screen.findByText("Could not load events")).toBeVisible();
  expect(screen.getByText("Scheduled list event")).toBeVisible();
  listFixture.statuses.set("/api/events", 403);
  await listPress("Try again");
  await waitFor(() => expect(screen.queryByText("Scheduled list event")).toBeNull());
  expect(screen.getByText("Could not load events")).toBeVisible();
});

it("reveals cached event pages without refetching or replacing their authoritative data", async () => {
  const key = eventRecordsQuery(
    { ...listOptions(), getToken: async () => "fixture-list-token" },
    { section: "mine", statuses: ["CONFIRMED", "PLANNING"], query: "" },
  ).queryKey;
  const cached = {
    pages: [
      { items: [listEvent("First retained event")], nextCursor: "cached" },
      { items: [listEvent("Second retained event", { id: listId(103) })], nextCursor: null },
    ],
    pageParams: ["", "cached"],
  };
  listFixture.client?.setQueryData(key, cached);
  await render(
    <MainListFixture>
      <Events />
    </MainListFixture>,
  );
  expect(screen.getByText("First retained event")).toBeVisible();
  expect(screen.queryByText("Second retained event")).toBeNull();
  await listPress("Load more");
  expect(await screen.findByText("Second retained event")).toBeVisible();
  expect(listFixture.client?.getQueryData(key)).toBe(cached);
  expect(listFixture.reads.filter((url) => url.pathname === "/api/events")).toHaveLength(0);
});

it("pages through explicit user intent, retains existing cards after a page error and retries only that cursor", async () => {
  listFixture.cursors.set("/api/events", "next-events");
  listFixture.nextEvents = [listEvent("Next scheduled event", { id: listId(104) })];
  await render(
    <MainListFixture>
      <Events />
    </MainListFixture>,
  );
  await screen.findByText("Scheduled list event");
  listFixture.statuses.set("/api/events", 503);
  await listPress("Load more");
  expect(await screen.findByText("Could not load events")).toBeVisible();
  expect(screen.getByText("Scheduled list event")).toBeVisible();
  listFixture.statuses.delete("/api/events");
  await listPress("Load more");
  expect(await screen.findByText("Next scheduled event")).toBeVisible();
  expect(
    listFixture.reads
      .filter((url) => url.pathname === "/api/events")
      .at(-1)
      ?.searchParams.get("cursor"),
  ).toBe("next-events");
});
