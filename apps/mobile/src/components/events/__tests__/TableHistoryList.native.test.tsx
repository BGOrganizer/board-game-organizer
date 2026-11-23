import { recordTablesQuery } from "@board-game-organizer/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { expect, it } from "vitest";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import {
  listApi,
  listFixture,
  listId,
  listJson,
  listOptions,
  listPress,
  listTable,
  MainListFixture,
} from "../../common/ui/__tests__/mainListFixture";
import { Tables } from "../Tables";

it("shows only genuinely finished, confirmed tables with current management, frozen participation or demonstrator duty", async () => {
  const otherPlayers = {
    gameId: 1,
    playerIds: ["other-one", "other-two"],
    startsAt: "2030-06-03T18:00:00.000Z",
  };
  listFixture.tables = [
    listTable("Managed history", { confirmed: otherPlayers }),
    listTable("Played history", { id: listId(201), canManage: false }),
    listTable("Demonstrated history", {
      id: listId(202),
      canManage: false,
      demonstratorUserId: "owner",
      confirmed: otherPlayers,
    }),
    listTable("Unrelated history", { id: listId(203), canManage: false, confirmed: otherPlayers }),
    listTable("Unconfirmed history", { id: listId(204), confirmed: undefined }),
    listTable("Still planning", { id: listId(205), eventStatus: "PLANNING" }),
  ];
  await render(
    <MainListFixture>
      <Tables />
    </MainListFixture>,
  );
  for (const name of ["Managed history", "Played history", "Demonstrated history"])
    expect(await screen.findByText(name)).toBeVisible();
  for (const name of ["Unrelated history", "Unconfirmed history", "Still planning"])
    expect(screen.queryByText(name)).toBeNull();
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
  expect(screen.queryByTestId("list-filter-TERMINATED")).toBeNull();
});

it("filters history with a short debounced query and clears it without discovering unrelated tables", async () => {
  await render(
    <MainListFixture>
      <Tables />
    </MainListFixture>,
  );
  await screen.findByText("History list table");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "H");
  await waitFor(() =>
    expect(
      listFixture.reads.some(
        (url) => url.pathname === "/api/tables" && url.searchParams.get("query") === "H",
      ),
    ).toBe(true),
  );
  await listPress("Clear filter");
  expect(screen.getByTestId("list-search-input")).toHaveDisplayValue("");
  expect(
    listFixture.reads
      .filter((url) => url.pathname === "/api/tables")
      .every((url) => url.searchParams.get("statuses") === "TERMINATED"),
  ).toBe(true);
});

it("distinguishes pending, failed and exhausted empty table history with an explicit retry", async () => {
  let finish: (response: Response) => void = () => {};
  listFixture.pending.set(
    "/api/tables",
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  await render(
    <MainListFixture>
      <Tables />
    </MainListFixture>,
  );
  expect(screen.queryByText("No tables found")).toBeNull();
  await act(() => finish(listJson({ error: "Unavailable" }, 503)));
  expect(await screen.findByText("Could not load tables")).toBeVisible();
  expect(screen.queryByText("No tables found")).toBeNull();
  listFixture.pending.clear();
  listFixture.tables = [];
  await listPress("Try again");
  expect(await screen.findByText("No tables found")).toBeVisible();
});

it("preserves usable cached history on ordinary failure and hides it on canonical denial", async () => {
  await render(
    <MainListFixture>
      <Tables />
    </MainListFixture>,
  );
  await screen.findByText("History list table");
  listFixture.statuses.set("/api/tables", 503);
  await act(async () => {
    await listFixture.client?.invalidateQueries({ queryKey: ["events", listApi, "owner"] });
  });
  expect(await screen.findByText("Could not load tables")).toBeVisible();
  expect(screen.getByText("History list table")).toBeVisible();
  listFixture.statuses.set("/api/tables", 403);
  await listPress("Try again");
  await waitFor(() => expect(screen.queryByText("History list table")).toBeNull());
});

it("reveals retained table-history pages progressively while preserving the complete Query snapshot", async () => {
  const key = recordTablesQuery(
    { ...listOptions(), getToken: async () => "fixture-list-token" },
    null,
    { query: "", statuses: ["TERMINATED"] },
  ).queryKey;
  const cached = {
    pages: [
      { items: [listTable("First retained table")], nextCursor: "cached" },
      { items: [listTable("Second retained table", { id: listId(206) })], nextCursor: null },
    ],
    pageParams: ["", "cached"],
  };
  listFixture.client?.setQueryData(key, cached);
  await render(
    <MainListFixture>
      <Tables />
    </MainListFixture>,
  );
  expect(screen.getByText("First retained table")).toBeVisible();
  expect(screen.queryByText("Second retained table")).toBeNull();
  await listPress("Load more");
  expect(await screen.findByText("Second retained table")).toBeVisible();
  expect(listFixture.client?.getQueryData(key)).toBe(cached);
  expect(listFixture.reads.filter((url) => url.pathname === "/api/tables")).toHaveLength(0);
});

it("requests further history by user action and keeps an exhausted first page while recovering a failed cursor", async () => {
  listFixture.cursors.set("/api/tables", "next-tables");
  listFixture.nextTables = [listTable("Next history table", { id: listId(207) })];
  await render(
    <MainListFixture>
      <Tables />
    </MainListFixture>,
  );
  await screen.findByText("History list table");
  listFixture.statuses.set("/api/tables", 503);
  await listPress("Load more");
  expect(await screen.findByText("Could not load tables")).toBeVisible();
  expect(screen.getByText("History list table")).toBeVisible();
  listFixture.statuses.delete("/api/tables");
  await listPress("Load more");
  expect(await screen.findByText("Next history table")).toBeVisible();
  expect(
    listFixture.reads
      .filter((url) => url.pathname === "/api/tables")
      .at(-1)
      ?.searchParams.get("cursor"),
  ).toBe("next-tables");
});

it("describes the criteria for including a table in History", async () => {
  await installNativePopoverMeasurements();
  await render(
    <MainListFixture>
      <Tables />
    </MainListFixture>,
  );
  expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Table history help" }));
  expect(screen.getByText(/Confirmed tables from finished events/)).toBeVisible();
});
