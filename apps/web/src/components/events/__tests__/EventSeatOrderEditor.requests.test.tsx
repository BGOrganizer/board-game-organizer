import type {
  PlannedTableResponse,
  TableSeatOrderInput,
  TableSeatOrderSnapshot,
} from "@board-game-organizer/schemas";
import { clearSessionQueryCache, useTableSeatOrder } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventSeatOrderEditor } from "../EventSeatOrderEditor";

const API = "https://seat-editor-fixtures.test";
const io = { getToken: vi.fn<() => Promise<string | null>>() };
const options = { apiUrl: API, userId: "owner", getToken: io.getToken };
const table: PlannedTableResponse = {
  ...plannedTable,
  canManage: true,
  eventVersion: 1,
  maxPlayers: 4,
};
const initial: TableSeatOrderSnapshot = {
  version: 1,
  allocationKey: "a".repeat(64),
  capacity: 4,
  seatedCount: 2,
  registrations: ["alice", "bob", "charlie"].map((userId, index) => ({
    ...seat(userId),
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    sequence: index,
    seatIndex: index === 0 ? 0 : index === 1 ? 2 : null,
    locked: false,
  })),
};
let client: QueryClient;
let snapshot: TableSeatOrderSnapshot;
let readStatus: number, writeStatus: number;
let pendingSave: Promise<Response> | undefined;
const reads: string[] = [];
const writes: { input: TableSeatOrderInput; authorization: string | null }[] = [];
function Harness({ version }: { version: number }) {
  const model = useTableSeatOrder(options, { ...table, eventVersion: version });
  return (
    <>
      <button type="button" onClick={() => void model.start()}>
        Edit roster
      </button>
      <EventSeatOrderEditor model={model} demonstratorUserId="bob" />
    </>
  );
}
function mount() {
  const tree = (version: number) => (
    <QueryClientProvider client={client}>
      <Harness version={version} />
    </QueryClientProvider>
  );
  const view = renderWithI18n(tree(1));
  return { ...view, version: (version: number) => view.rerender(tree(version)) };
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Edit roster" }));
  await screen.findByText("@alice");
}
beforeEach(() => {
  vi.clearAllMocks();
  io.getToken.mockResolvedValue("initial-roster-token");
  snapshot = { ...initial, registrations: initial.registrations.map((row) => ({ ...row })) };
  readStatus = writeStatus = 200;
  pendingSave = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      expect(url.pathname).toBe(`/api/events/${table.eventId}/tables/${table.id}/seats/order`);
      const authorization = new Headers(init?.headers).get("authorization");
      expect(authorization).toMatch(/^Bearer (initial|fresh)-roster-token$/);
      if (init?.method === "PATCH") {
        const body: TableSeatOrderInput = JSON.parse(String(init.body));
        writes.push({ input: body, authorization });
        if (pendingSave) return pendingSave;
        if (writeStatus !== 200)
          return Response.json({ error: "Order refused" }, { status: writeStatus });
        if (body.seatedCount === undefined)
          throw new Error("Expected the editor to send its seated count");
        snapshot = {
          ...snapshot,
          version: snapshot.version + 1,
          seatedCount: body.seatedCount,
          registrations: body.registrations.map((row) => {
            const original = snapshot.registrations.find((item) => item.id === row.id);
            if (!original) throw new Error(`Unknown registration ${row.id}`);
            return { ...original, ...row, version: original.version + 1 };
          }),
        };
        return Response.json(snapshot);
      }
      expect(init?.method).toBe("GET");
      reads.push(url.pathname);
      return Response.json(readStatus === 200 ? snapshot : { error: "Roster unavailable" }, {
        status: readStatus,
      });
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.unstubAllGlobals();
});

it("moves a row down through a real empty place and saves the explicit positions from the UI", async () => {
  mount();
  expect(screen.getByRole("button", { name: "Save seat order" })).toBeDisabled();
  await open();
  expect(screen.getByText("Free place: 2")).toBeVisible();
  expect(screen.getByText("Free place: 4")).toBeVisible();
  fireEvent.click(screen.getByTestId(`seat-order-down-${initial.registrations[0].id}`));
  expect(screen.getByText("Free place: 1")).toBeVisible();
  io.getToken.mockResolvedValue("fresh-roster-token");
  fireEvent.click(screen.getByRole("button", { name: "Save seat order" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].authorization).toBe("Bearer fresh-roster-token");
  expect(writes[0].input).toEqual({
    version: 1,
    allocationKey: initial.allocationKey,
    seatedCount: 2,
    registrations: initial.registrations.map((row, index) => ({
      id: row.id,
      version: row.version,
      locked: false,
      seatIndex: index === 0 ? 1 : index === 1 ? 2 : null,
    })),
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save seat order" })).toBeEnabled(),
  );
  expect(reads).toHaveLength(1);
});

it("disables row, lock, discard and save controls while a real write awaits its receipt", async () => {
  let release: ((response: Response) => void) | undefined;
  pendingSave = new Promise<Response>((resolve) => {
    release = resolve;
  });
  mount();
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Save seat order" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  for (const button of screen.getAllByRole("button", {
    name: /^(Move up|Move down|Lock player|Discard unsaved order|Save seat order)$/,
  }))
    expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save seat order" }));
  expect(writes).toHaveLength(1);
  const finish = release;
  if (!finish) throw new Error("Expected a pending seat-order receipt");
  snapshot = { ...snapshot, version: 2 };
  await act(async () => finish(Response.json(snapshot)));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Discard unsaved order" })).toBeEnabled(),
  );
});

it("shows a rejected save and recovers through the editor's real review-latest action", async () => {
  writeStatus = 400;
  mount();
  await open();
  fireEvent.click(screen.getByTestId(`seat-order-down-${initial.registrations[0].id}`));
  fireEvent.click(screen.getByRole("button", { name: "Save seat order" }));
  expect(await screen.findByText("Could not save seat order")).toBeVisible();
  expect(screen.getByText("Free place: 1")).toBeVisible();
  expect(writes).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Review latest roster" }));
  await waitFor(() => expect(reads).toHaveLength(2));
  expect(await screen.findByText("Free place: 2")).toBeVisible();
  expect(screen.queryByText("Could not save seat order")).toBeNull();
  expect(writes).toHaveLength(1);
});

it("requires a fresh snapshot after the event revision advances, preserving the old order until explicit review", async () => {
  const view = mount();
  await open();
  fireEvent.click(screen.getByTestId(`seat-order-down-${initial.registrations[0].id}`));
  snapshot = { ...snapshot, version: 2 };
  view.version(2);
  expect(
    screen.getByText("The roster changed. Review a fresh snapshot before saving."),
  ).toBeVisible();
  expect(screen.getByText("Free place: 1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save seat order" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save seat order" }));
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Review latest roster" }));
  expect(await screen.findByText("Free place: 2")).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save seat order" })).toBeEnabled(),
  );
  expect(
    screen.queryByText("The roster changed. Review a fresh snapshot before saving."),
  ).toBeNull();
});
