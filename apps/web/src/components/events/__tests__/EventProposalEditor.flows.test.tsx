import type {
  EventProposalResponse,
  PlannedEventResponse,
  PlannedTableResponse,
  SubmitEventProposalInput,
} from "@board-game-organizer/schemas";
import { submitEventProposalSchema } from "@board-game-organizer/schemas";
import { clearSessionQueryCache, eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { enterDateTime, readDateTime } from "@/test-fixtures/dateTime";
import { optionId, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventProposalEditor } from "../EventProposalEditor";

const boundary = vi.hoisted(() => {
  const previousApi = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://proposal-editor-flows.test";
  return { previousApi, back: vi.fn(), getToken: vi.fn<() => Promise<string | null>>() };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: boundary.back }) }));
afterAll(() => {
  if (boundary.previousApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = boundary.previousApi;
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
// WebGL is the provider boundary; picker state, fields and verified-address
// HTTP remain real. Node cannot create the MapLibre browser canvas.
vi.mock("@maptiler/sdk", () => ({
  config: { apiKey: "" },
  MapStyle: { STREETS: { DARK: "dark" } },
  Map: class {
    remove() {}
    flyTo() {}
    setStyle() {}
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));
const options = {
  apiUrl: "https://proposal-editor-flows.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const event: PlannedEventResponse = {
  ...plannedEvent,
  adminUserId: "creator",
  groupId: optionId,
  groupType: "PRIVATE",
  role: "participant",
  canManage: false,
  canVote: true,
  canProposeDates: true,
  canProposeLocations: true,
  allowParticipantDates: true,
  allowParticipantLocations: true,
  myRegistrations: [seat("owner")],
};
const table: PlannedTableResponse = {
  ...plannedTable,
  groupId: optionId,
  groupType: "PRIVATE",
  canProposeGames: true,
  allowParticipantGames: true,
  myRegistration: seat("owner"),
  myPosition: "SEATED",
};
const candidate = {
  ...plannedEvent.locations[0],
  id: "44444444-4444-4444-8444-444444444444",
  name: "New games cafe",
  address: "New verified road 2",
};
let client: QueryClient;
let eventStatus: number;
let pendingEvent: Promise<Response> | undefined;
const reads: URL[] = [],
  writes: SubmitEventProposalInput[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fresh-editor-token");
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_API_KEY", "public-fixture-map-key");
  reads.length = writes.length = 0;
  eventStatus = 200;
  pendingEvent = undefined;
  installBrowserIntersections();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(options.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-editor-token");
      if (init?.method === "POST" && url.pathname === `/api/events/${event.id}/proposals`) {
        const input = submitEventProposalSchema.parse(JSON.parse(String(init.body)));
        writes.push(input);
        const response: EventProposalResponse = {
          id: "55555555-5555-4555-8555-555555555555",
          eventId: event.id,
          groupId: optionId,
          userId: "owner",
          authorName: "Proposing player",
          clientRequestId: input.clientRequestId,
          payload: input.payload,
          label: "Proposed option",
          status: "PENDING",
          version: 1,
          submittedEventVersion: input.eventVersion,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        };
        return Response.json(response, { status: 201 });
      }
      reads.push(url);
      if (url.pathname === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          Response.json(eventStatus === 200 ? event : { error: "Fixture event unavailable" }, {
            status: eventStatus,
          })
        );
      if (url.pathname === `/api/events/${event.id}/tables/${table.id}`)
        return Response.json(table);
      if (url.pathname.endsWith("/bgg/account"))
        return Response.json({ active: null, pending: null });
      if (url.pathname.endsWith("/bgg/picker"))
        return Response.json({
          items: [
            { id: 1, name: "Chess", imageUrl: null, year: null, source: "search" },
            { id: 2, name: "New strategy game", imageUrl: null, year: 2020, source: "search" },
          ],
          nextCursor: null,
        });
      if (url.pathname === "/api/locations/favorites")
        return Response.json(
          url.searchParams.has("keys") ? { keys: [] } : { items: [], nextCursor: null },
        );
      if (url.pathname === "/api/locations/search") return Response.json({ items: [candidate] });
      throw new Error(`Unexpected editor request: ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function mount(
  kind: string,
  {
    seed = true,
    draftId,
    tableId = table.id,
  }: { seed?: boolean; draftId?: string; tableId?: string } = {},
) {
  if (seed) {
    client.setQueryData(eventRecordKeys.detail(options, event.id), event);
    client.setQueryData(eventRecordKeys.table(options, event.id, table.id), table);
  }
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <EventProposalEditor eventId={event.id} kind={kind} tableId={tableId} draftId={draftId} />
    </QueryClientProvider>,
  );
}
const deniedMessage =
  "Proposals require an enabled category and your own seated participation in a private planning event.";

it("keeps uncached loading distinct from eligibility denial and retries an authoritative event read", async () => {
  let finish: (response: Response) => void = () => {};
  pendingEvent = new Promise((resolve) => {
    finish = resolve;
  });
  mount("date", { seed: false });
  expect(screen.queryByText(deniedMessage)).toBeNull();
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
  await act(async () => finish(Response.json({ error: "Forbidden" }, { status: 403 })));
  expect(await screen.findByText(deniedMessage)).toBeVisible();
  expect(screen.queryByLabelText("Choose date and time")).toBeNull();
  pendingEvent = undefined;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("group", { name: "Choose date and time" })).not.toHaveAttribute(
    "data-disabled",
    "true",
  );
  expect(writes).toHaveLength(0);
});

it.each([
  { kind: "unrecognized", tableId: table.id },
  { kind: "game", tableId: "" },
])("refuses unsupported or incomplete category routes: $kind/$tableId", ({ kind, tableId }) => {
  mount(kind, { tableId });
  expect(screen.getByText(deniedMessage)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(boundary.back).toHaveBeenCalledOnce();
  expect(writes).toHaveLength(0);
});

it("refuses a missing draft recovery without silently replacing it with a new proposal", () => {
  mount("date", { draftId: "missing-proposal" });
  expect(screen.getByText(deniedMessage)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
  expect(writes).toHaveLength(0);
});

it("validates an empty date attempt then sends one explicitly chosen proposal and coalesces repeat taps", async () => {
  mount("date");
  const send = screen.getByRole("button", { name: "Send proposal" });
  fireEvent.click(send);
  expect(screen.getByText("Choose a valid date and time.")).toBeVisible();
  expect(boundary.back).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
  enterDateTime(screen.getByRole("group", { name: "Choose date and time" }), "2030-06-04T19:15");
  expect(screen.queryByText("Choose a valid date and time.")).toBeNull();
  fireEvent.click(send);
  fireEvent.click(send);
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    eventVersion: event.version,
    payload: { kind: "date", day: "2030-06-04", startTime: "19:15" },
  });
  expect(writes[0]).not.toHaveProperty("clientLabel");
  expect(boundary.back).toHaveBeenCalledOnce();
});

it("reacts to an authoritative eligibility change without replacing the current user's unsaved date choice", async () => {
  mount("date");
  enterDateTime(screen.getByRole("group", { name: "Choose date and time" }), "2030-06-04T19:15");
  await act(async () =>
    client.setQueryData(eventRecordKeys.detail(options, event.id), {
      ...event,
      version: 2,
      canProposeDates: false,
    }),
  );
  expect(await screen.findByText(deniedMessage)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
  await act(async () =>
    client.setQueryData(eventRecordKeys.detail(options, event.id), { ...event, version: 3 }),
  );
  expect(readDateTime(await screen.findByRole("group", { name: "Choose date and time" }))).toBe(
    "2030-06-04T19:15",
  );
  fireEvent.click(screen.getByRole("button", { name: "Send proposal" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].eventVersion).toBe(3);
});

it("uses the actual game picker with proposal authorization, excludes current options and submits the selected game", async () => {
  mount("game");
  await screen.findByRole("heading", { name: "Select a board game" });
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search board games" }), {
    target: { value: "strategy" },
  });
  const choice = await screen.findByRole("option", { name: "Select: New strategy game" });
  expect(screen.queryByRole("option", { name: "Select: Chess" })).toBeNull();
  expect(writes).toHaveLength(0);
  const request = reads.find((url) => url.pathname.endsWith("/bgg/picker"));
  expect(request?.searchParams.get("proposalEventId")).toBe(event.id);
  expect(request?.searchParams.get("proposalTableId")).toBe(table.id);
  fireEvent.click(choice);
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].payload).toEqual({ kind: "game", tableId: table.id, gameId: 2 });
  expect(boundary.back).toHaveBeenCalledOnce();
});

it("uses the actual verified-location picker and sends only the final explicit confirmation", async () => {
  mount("location");
  const search = await screen.findByRole("searchbox", { name: "Search address/place" });
  fireEvent.change(search, { target: { value: "New verified road" } });
  fireEvent.click(await screen.findByRole("button", { name: candidate.address }));
  fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), {
    target: { value: candidate.name },
  });
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Confirm location" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].payload).toMatchObject({
    kind: "location",
    location: { ...candidate, id: expect.any(String) },
  });
  expect(boundary.back).toHaveBeenCalledOnce();
});

it.each(["game", "location"])(
  "keeps cancelling the actual %s picker free of proposal writes",
  async (kind) => {
    mount(kind);
    const back = await screen.findByRole("button", { name: "Back" });
    fireEvent.click(back);
    expect(boundary.back).toHaveBeenCalledOnce();
    expect(writes).toHaveLength(0);
  },
);
