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
import { expect, it } from "vitest";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import {
  listApi,
  listBoundary,
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

it("keeps owned filtering independent of discovery's four-character minimum and clears it deliberately", async () => {
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
  await listTab("search");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "Pub");
  expect(
    listFixture.reads.filter((url) => url.searchParams.get("scope") === "public"),
  ).toHaveLength(0);
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "Public");
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
  expect(screen.getByTestId("list-filter-admin")).toBeSelected();
  await userEvent.setup().press(screen.getByRole("button", { name: "Admin", selected: true }));
  expect(await screen.findByText("No groups found")).toBeVisible();
  expect(
    listFixture.reads.some((url) => url.searchParams.get("roles") === "invited,accepted"),
  ).toBe(true);
  await listTab("search");
  expect(screen.queryByTestId("list-filter-admin")).toBeNull();
  expect(screen.queryByTestId("list-filter-invited")).toBeNull();
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
    ["admin", "invited", "accepted"],
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
  ["search", "Search", "Group search help", /Search for approved public groups by name/],
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

it("centers both discovery empty states and keeps the input accessible", async () => {
  await render(
    <MainListFixture>
      <Groups initialSection="search" />
    </MainListFixture>,
  );
  const prompt = "Enter at least 4 characters to search";
  const input = screen.getByLabelText("Search groups");
  expect(input).toHaveDisplayValue("");
  expect(screen.queryByText("Search groups")).toBeNull();
  expect(screen.queryByRole("button", { name: "Search groups: Search help" })).toBeNull();
  expect(screen.getByText(prompt).parent).toHaveStyle({ alignItems: "center" });
  await fireEvent.changeText(input, "abc");
  expect(screen.getAllByText(prompt)).toHaveLength(1);
  expect(
    listFixture.reads.filter((url) => url.searchParams.get("scope") === "public"),
  ).toHaveLength(0);
  await fireEvent.changeText(input, "missing");
  const empty = await screen.findByText("No groups found");
  expect(empty.parent).toHaveStyle({ alignItems: "center" });
  expect(screen.queryByText(prompt)).toBeNull();
  await listPress("Clear search");
  expect(screen.getByText(prompt)).toBeVisible();
  expect(screen.queryByText("No groups found")).toBeNull();
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
