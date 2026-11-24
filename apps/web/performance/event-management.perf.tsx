import type { TableSeatOrderInput, TableSeatOrderSnapshot } from "@board-game-organizer/schemas";
import { useTableSeatOrder } from "@board-game-organizer/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import EventInvitationPage from "@/app/(tabs)/events/[eventId]/tables/[tableId]/invite/page";
import { EventDeleteAction } from "@/components/events/EventDeleteAction";
import { EventFinalizeAction } from "@/components/events/EventFinalizeAction";
import { EventGuestVoteEditor } from "@/components/events/EventGuestVoteEditor";
import { EventSeatOrderEditor } from "@/components/events/EventSeatOrderEditor";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { measureWebFeature } from "./featureScenario";

const api = vi.hoisted(() => ({
  apiUrl: "https://event-management-render.test",
  userId: "owner",
  getToken: async () => "fixture-event-manager",
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => api }));
const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back, replace: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

function stubApi(respond: (url: URL, init?: RequestInit) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(api.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-event-manager");
      return respond(url, init);
    }),
  );
}

measureWebFeature(
  "EventDeleteAction: explain why the last table cannot be deleted",
  <EventDeleteAction event={plannedEvent} table={plannedTable} />,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete table" }));
    const reason = within(await screen.findByRole("dialog"));
    expect(
      reason.getByText("An event must keep at least one table. Delete the event instead."),
    ).toBeVisible();
    expect(reason.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  },
  () =>
    stubApi(() => {
      throw new Error("The blocked table action must not call the API");
    }),
);

measureWebFeature(
  "EventFinalizeAction: cancel the immutable results and private sharing confirmation",
  <EventFinalizeAction
    event={{
      ...plannedEvent,
      groupId: groupRecord.id,
      groupType: "PRIVATE",
      visibility: "PRIVATE",
      status: "CONFIRMED",
      canFinalize: true,
      resultsReady: true,
    }}
  />,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
    const confirm = within(await screen.findByRole("dialog", { name: "Finalize event?" }));
    expect(confirm.getByText(/immutable together/)).toBeVisible();
    const share = confirm.getByRole("switch", { name: "Share results with participants' friends" });
    expect(share).not.toBeChecked();
    fireEvent.click(share);
    expect(share).toBeChecked();
    fireEvent.click(confirm.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
    expect(
      screen.getByRole("switch", { name: "Share results with participants' friends" }),
    ).not.toBeChecked();
    expect(fetch).not.toHaveBeenCalled();
  },
  () =>
    stubApi(() => {
      throw new Error("Cancellation must not finalize an event");
    }),
);

const seatTable = { ...plannedTable, canManage: true, eventVersion: 1, maxPlayers: 4 };
const snapshot: TableSeatOrderSnapshot = {
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
const rosterWrites: TableSeatOrderInput[] = [];

function EditableRoster() {
  const model = useTableSeatOrder(api, seatTable);
  return (
    <>
      <button type="button" onClick={() => void model.start()}>
        Edit roster
      </button>
      <EventSeatOrderEditor model={model} demonstratorUserId="bob" />
    </>
  );
}

measureWebFeature(
  "EventSeatOrderEditor: move across an empty seat and save explicit authoritative positions",
  <EditableRoster />,
  async () => {
    expect(screen.getByRole("button", { name: "Save seat order" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit roster" }));
    expect(await screen.findByText("@alice")).toBeVisible();
    expect(screen.getByText("Free place: 2")).toBeVisible();
    fireEvent.click(screen.getByTestId(`seat-order-down-${snapshot.registrations[0].id}`));
    expect(screen.getByText("Free place: 1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save seat order" }));
    await waitFor(() => expect(rosterWrites).toHaveLength(1));
    expect(rosterWrites[0]).toEqual({
      version: snapshot.version,
      allocationKey: snapshot.allocationKey,
      seatedCount: 2,
      registrations: snapshot.registrations.map((row, i) => ({
        id: row.id,
        version: row.version,
        locked: false,
        seatIndex: i === 0 ? 1 : row.seatIndex,
      })),
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save seat order" })).toBeEnabled(),
    );
  },
  () => {
    rosterWrites.length = 0;
    stubApi((url, init) => {
      expect(url.pathname).toBe(
        `/api/events/${seatTable.eventId}/tables/${seatTable.id}/seats/order`,
      );
      if (init?.method !== "PATCH") return Response.json(snapshot);
      const input: TableSeatOrderInput = JSON.parse(String(init.body));
      rosterWrites.push(input);
      return Response.json({
        ...snapshot,
        version: snapshot.version + 1,
        registrations: snapshot.registrations.map((row, i) => ({
          ...row,
          ...input.registrations[i],
          version: row.version + 1,
        })),
      });
    });
  },
);

const guestTable = {
  ...plannedTable,
  canManage: true,
  games: [...plannedTable.games, { gameId: 2 }],
  gamesDetail: [...plannedTable.gamesDetail, { id: 2, name: "Azul", year: null, imageUrl: null }],
};
const guestEvent = {
  ...plannedEvent,
  canManage: true,
  dates: [...plannedEvent.dates, { id: "second-date", day: "2030-06-05" }],
  locations: [
    ...plannedEvent.locations,
    { ...plannedEvent.locations[0], id: "second-venue", name: "Another venue" },
  ],
};
const closeGuest = vi.fn();
const guestWrites: unknown[] = [];

measureWebFeature(
  "EventGuestVoteEditor: stage choices across tabs and submit one guest ballot",
  <EventGuestVoteEditor
    name="Guest Alice"
    registrationId="guest-entry"
    table={guestTable}
    onClose={closeGuest}
  />,
  async () => {
    const editor = within(await screen.findByRole("dialog", { name: "Edit guest votes" }));
    expect(await editor.findByRole("tab", { name: "Dates", selected: true })).toBeVisible();
    const submit = editor.getByRole("button", { name: "Vote" });
    expect(submit).toBeDisabled();
    fireEvent.click(editor.getByRole("tab", { name: "Locations" }));
    fireEvent.click(editor.getByRole("button", { name: "Another venue: If needed" }));
    fireEvent.click(editor.getByRole("tab", { name: "Games" }));
    fireEvent.click(editor.getByRole("button", { name: "Chess: Yes" }));
    expect(editor.getByRole("button", { name: "Chess: Yes", pressed: true })).toBeVisible();
    expect(guestWrites).toEqual([]);
    fireEvent.click(submit);
    await waitFor(() => expect(closeGuest).toHaveBeenCalledOnce());
    expect(guestWrites).toEqual([
      {
        votes: [
          { kind: "location", optionId: "second-venue", vote: "IF_NEEDED" },
          { kind: "game", tableId: guestTable.id, gameId: 1, vote: "YES" },
        ],
      },
    ]);
  },
  () => {
    closeGuest.mockClear();
    guestWrites.length = 0;
    let saved = { guestName: "Guest Alice", dateVotes: {}, locationVotes: {}, gameVotes: {} };
    stubApi((url, init) => {
      if (url.pathname === `/api/events/${guestEvent.id}`) return Response.json(guestEvent);
      if (init?.method === "POST") {
        expect(url.pathname.endsWith("/guests/guest-entry/votes")).toBe(true);
        guestWrites.push(JSON.parse(String(init.body)));
        saved = {
          ...saved,
          locationVotes: { "second-venue": "IF_NEEDED" },
          gameVotes: { "1": "YES" },
        };
      } else {
        expect(url.pathname.endsWith("/guests/guest-entry")).toBe(true);
      }
      return Response.json(saved);
    });
  },
);

measureWebFeature(
  "Event invitation route: validate a guest's optional email and save without creating a contact",
  () =>
    EventInvitationPage({
      params: Promise.resolve({ eventId: plannedEvent.id, tableId: plannedTable.id }),
    }),
  async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Add a guest" }));
    const username = await screen.findByRole("textbox", { name: "Username" });
    const email = screen.getByRole("textbox", { name: "Email" });
    const add = screen.getByRole("button", { name: "Add" });
    expect(username).toBeRequired();
    expect(email).not.toBeRequired();
    expect(add).toBeDisabled();
    fireEvent.change(username, { target: { value: "  Guest Alice  " } });
    fireEvent.change(email, { target: { value: "invalid" } });
    fireEvent.blur(email);
    expect(await screen.findByText("Enter a valid email address.")).toBeVisible();
    expect(add).toBeDisabled();
    fireEvent.change(email, { target: { value: "alice@example.test" } });
    fireEvent.click(add);
    await waitFor(() => expect(back).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Select user: Guest Alice" })).toBeNull();
  },
  () => {
    back.mockClear();
    stubApi((url, init) => {
      if (init?.method === "POST") {
        expect(url.pathname).toBe(
          `/api/events/${plannedEvent.id}/tables/${plannedTable.id}/guests`,
        );
        expect(JSON.parse(String(init.body))).toEqual({
          name: "Guest Alice",
          email: "alice@example.test",
          requestId: expect.stringMatching(/^[a-f\d-]{36}$/),
        });
        return Response.json({
          ...seat("guest:4a6bd36e-a27b-4b44-84df-8a4e36ee5f4e"),
          kind: "GUEST",
          guestName: "Guest Alice",
          status: "ACCEPTED",
          eventVersion: 2,
        });
      }
      if (url.pathname.endsWith("/invitations"))
        return Response.json({ items: [], nextCursor: null });
      expect(url.pathname).toBe(`/api/events/${plannedEvent.id}`);
      return Response.json(plannedEvent);
    });
  },
);
