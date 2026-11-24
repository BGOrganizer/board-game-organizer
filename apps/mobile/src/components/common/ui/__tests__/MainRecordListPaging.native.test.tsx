import "./mainListFixture";

import { act, render, screen, waitFor } from "@testing-library/react-native";
import { expect, it } from "vitest";
import EventsScreen from "@/app/(tabs)/events";
import TablesScreen from "@/app/(tabs)/tables";
import {
  listEvent,
  listFixture,
  listId,
  listJson,
  listTable,
  MainListFixture,
  scrollListEnd,
} from "./mainListFixture";

function owningList(text: string) {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText(text);
  while (node && typeof node.props.onScroll !== "function") node = node.parent;
  if (!node) throw new Error("Expected owning native list for the earliest resource");
  return node;
}

it.each([
  {
    kind: "events",
    firstLabel: "Scheduled list event",
    nextLabel: "Later event",
    Route: EventsScreen,
  },
  {
    kind: "tables",
    firstLabel: "History list table",
    nextLabel: "Later table",
    Route: TablesScreen,
  },
] as const)(
  "loads a bounded page from the real $kind list and coalesces repeated edge gestures while it is fetching",
  async ({ kind, firstLabel, nextLabel, Route }) => {
    const path = `/api/${kind}`;
    const cursor = `${kind}-page-two`;
    listFixture.cursors.set(path, cursor);
    const next =
      kind === "events"
        ? listEvent(nextLabel, { id: listId(110) })
        : listTable(nextLabel, { id: listId(210) });

    await render(
      <MainListFixture>
        <Route />
      </MainListFixture>,
    );
    expect(await screen.findByText(firstLabel)).toBeVisible();
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
    const pageReads = () =>
      listFixture.reads.filter((read) => read.pathname === path && read.searchParams.has("cursor"));
    let respond!: (page: Response) => void;
    listFixture.pending.set(
      path,
      new Promise((resolve) => {
        respond = resolve;
      }),
    );
    const firstList = owningList(firstLabel);
    await scrollListEnd(firstList);
    await waitFor(() => expect(pageReads()).toHaveLength(1));
    expect(pageReads()[0].searchParams.get("cursor")).toBe(cursor);
    expect(screen.getByText(firstLabel)).toBeVisible();
    expect(screen.queryByText(nextLabel)).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

    await scrollListEnd(firstList);
    expect(pageReads()).toHaveLength(1);
    await act(() => {
      listFixture.pending.delete(path);
      respond(listJson({ items: [next], nextCursor: null }));
    });
    expect(await screen.findByText(nextLabel)).toBeVisible();
    expect(owningList(nextLabel)).toBe(firstList);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(pageReads()).toHaveLength(1);
  },
);
