import { URL } from "node:url";
import {
  type CommunityPageResponse,
  type PlannedEventResponse,
  type PlannedTableResponse,
  type SaveTableResultInput,
  saveTableResultSchema,
  type TableSeatResponse,
} from "@board-game-organizer/schemas";
import { CommunityApiError, eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { type ReactNode, useEffect } from "react";
import { BackHandler, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EventResultsScreen from "@/app/event/results";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../../web/src/test-fixtures/eventRecords";

const boundary = vi.hoisted(() => ({
  back: vi.fn(),
  dismissTo: vi.fn(),
  getToken: vi.fn(async () => "results-native-token"),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "result-owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://results-native.test" } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: boundary.back, dismissTo: boundary.dismissTo }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({ eventId: event.id, tableId: table.id }),
  useFocusEffect: (effect: () => undefined | (() => void)) => useEffect(effect, [effect]),
  Stack: {
    Screen: ({ options }: { options: { headerLeft?: () => ReactNode } }) => (
      <View>{options.headerLeft?.()}</View>
    ),
  },
}));
const options = {
  apiUrl: "https://results-native.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let people: CommunityPageResponse<TableSeatResponse>;
let nextPeople: CommunityPageResponse<TableSeatResponse>;
let eventCode: number, tableCode: number, peopleCode: number, writeCode: number;
let pendingEvent: Promise<Response> | undefined;
let pendingTable: Promise<Response> | undefined;
let pendingWrite: Promise<Response> | undefined;
let pendingPeople: Promise<Response> | undefined;
const reads: { url: URL; authorization: string | null }[] = [];
const writes: { path: string; input: SaveTableResultInput; authorization: string | null }[] = [];
const seatsKey = () => [...eventRecordKeys.root(options), "seats", event.id, table.id, false, ""];
function person(userId: string, index: number): TableSeatResponse {
  return {
    ...seat(userId),
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `${userId === "owner" ? "Owner" : userId === "guest" ? "Guest" : "Waiting"} Player`,
    position: userId === "waiting" ? "WAITING" : "SEATED",
  };
}
function saveReceipt(input: SaveTableResultInput) {
  const { version: _version, ...resultDraft } = input;
  event = { ...event, version: event.version + 1, resultsReady: true };
  table = { ...table, eventVersion: event.version, resultDraft };
  return { event, table };
}
beforeEach(() => {
  vi.clearAllMocks();
  reads.length = writes.length = 0;
  eventCode = tableCode = peopleCode = writeCode = 200;
  pendingEvent = pendingTable = pendingWrite = pendingPeople = undefined;
  event = {
    ...plannedEvent,
    status: "CONFIRMED",
    canManage: true,
    managementRole: "admin",
    canFinalize: true,
    confirmed: {
      dateId: plannedEvent.dates[0].id,
      locationId: plannedEvent.locations[0].id,
      at: "2030-06-02T12:00:00Z",
    },
  };
  table = {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    eventVersion: 1,
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
    resultDraft: {
      lowerWins: false,
      entries: [
        { userId: "owner", score: "20" },
        { userId: "guest", score: "10" },
      ],
      tieBreaks: [],
    },
  };
  people = {
    items: [person("owner", 1), person("guest", 2), person("waiting", 3)],
    nextCursor: null,
  };
  nextPeople = { items: [person("guest", 2)], nextCursor: null };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== options.apiUrl)
        throw new Error(`Unexpected results origin: ${url.origin}`);
      const method = init?.method ?? "GET";
      const authorization = new Headers(init?.headers).get("authorization");
      if (
        method === "PUT" &&
        url.pathname === `/api/events/${event.id}/tables/${table.id}/results`
      ) {
        const input = saveTableResultSchema.parse(JSON.parse(String(init?.body)));
        writes.push({ path: url.pathname, input, authorization });
        return (
          pendingWrite ??
          Response.json(writeCode === 200 ? saveReceipt(input) : { error: "Results rejected" }, {
            status: writeCode,
          })
        );
      }
      if (method !== "GET") throw new Error(`Unexpected results write: ${method} ${url.href}`);
      reads.push({ url, authorization });
      if (url.pathname === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          Response.json(eventCode === 200 ? event : { error: "Event unavailable" }, {
            status: eventCode,
          })
        );
      if (url.pathname === `/api/events/${event.id}/tables/${table.id}`)
        return (
          pendingTable ??
          Response.json(tableCode === 200 ? table : { error: "Table unavailable" }, {
            status: tableCode,
          })
        );
      if (url.pathname === `/api/events/${event.id}/tables/${table.id}/seats`)
        return (
          pendingPeople ??
          Response.json(
            peopleCode === 200
              ? url.searchParams.has("cursor")
                ? nextPeople
                : people
              : { error: "Players unavailable" },
            { status: peopleCode },
          )
        );
      throw new Error(`Unexpected results read: ${url.href}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function seed() {
  client.setQueryData(eventRecordKeys.detail(options, event.id), event);
  client.setQueryData(eventRecordKeys.table(options, event.id, table.id), table);
  client.setQueryData(seatsKey(), { pages: [people], pageParams: [""] });
}
function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventResultsScreen />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function mount(cached = true) {
  if (cached) seed();
  return render(<Fixture />);
}
async function press(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
async function ready() {
  await screen.findByRole("button", { name: "Score: Owner Player" });
  await waitFor(() =>
    expect(client.isFetching({ queryKey: eventRecordKeys.root(options) })).toBe(0),
  );
}
const denied = "Only an authorized organizer can record results for an included confirmed table.";

it("renders only frozen participants and the saved draft while preserving cached waiting users", async () => {
  await mount();
  await ready();
  // This is in-content native Typography, not the navigation header slot.
  const title = screen.getByText("Chess");
  expect(title).toBeVisible();
  expect(title).toHaveProp("accessibilityRole", "header");
  expect(screen.queryByText(table.name)).toBeNull();
  expect(screen.getByRole("button", { name: "Score: Guest Player" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Score: Waiting Player" })).toBeNull();
  expect(
    screen.getByText(
      "Saved scores remain editable. Ratings and statistics update only when the event is finalized.",
    ),
  ).toBeVisible();
  expect(client.getQueryData(seatsKey())).toMatchObject({ pages: [{ items: people.items }] });
  expect(reads).toHaveLength(2);
  expect(reads.every((read) => read.authorization === "Bearer results-native-token")).toBe(true);
  expect(writes).toEqual([]);
  await press("Back");
  expect(boundary.back).toHaveBeenCalledOnce();
});

it.each([
  "non-manager",
  "read-only",
  "no-finalize",
  "planning",
  "terminated",
  "excluded-table",
] as const)("withholds score entry for an authoritative %s projection", async (reason) => {
  if (reason === "non-manager") event = { ...event, canManage: false, managementRole: null };
  else if (reason === "read-only") event = { ...event, readOnly: true };
  else if (reason === "no-finalize") event = { ...event, canFinalize: false };
  else if (reason === "excluded-table") table = { ...table, confirmed: undefined };
  else event = { ...event, status: reason === "planning" ? "PLANNING" : "TERMINATED" };
  await mount();
  expect(await screen.findByText(denied)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Score: / })).toBeNull();
  expect(writes).toEqual([]);
});

it("keeps uncached loading distinct from a denied organizer and then reveals the verified frozen roster", async () => {
  let finishEvent: (response: Response) => void = () => {};
  let finishTable: (response: Response) => void = () => {};
  pendingEvent = new Promise((resolve) => {
    finishEvent = resolve;
  });
  pendingTable = new Promise((resolve) => {
    finishTable = resolve;
  });
  await mount(false);
  expect(screen.queryByText(denied)).toBeNull();
  expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
  await act(async () => {
    finishEvent(Response.json(event));
    finishTable(Response.json(table));
  });
  await ready();
  expect(screen.getByRole("button", { name: "Save result" })).toBeEnabled();
  expect(writes).toEqual([]);
});

it.each(["event", "table"] as const)(
  "retries a failed %s read without treating it as an empty success",
  async (resource) => {
    if (resource === "event") eventCode = 503;
    else tableCode = 503;
    await mount(false);
    expect(await screen.findByText("Could not load table")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
    eventCode = tableCode = 200;
    await press("Try again");
    await ready();
    expect(screen.queryByText("Could not load table")).toBeNull();
    expect(writes).toEqual([]);
  },
);

it.each(["event", "table"] as const)(
  "quarantines cached identity after a forbidden %s refresh",
  async (resource) => {
    if (resource === "event") eventCode = 403;
    else tableCode = 403;
    await mount();
    expect(await screen.findByText("Could not load table")).toBeVisible();
    expect(screen.queryByText("Chess")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Score: / })).toBeNull();
    expect(writes).toEqual([]);
  },
);

it("retries a missing frozen player without accepting a truncated roster", async () => {
  people = { items: [person("owner", 1)], nextCursor: null };
  await mount();
  expect(await screen.findByText("Could not load players")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
  people = { items: [person("owner", 1), person("guest", 2)], nextCursor: null };
  await press("Try again");
  await ready();
  expect(screen.getByRole("button", { name: "Score: Guest Player" })).toBeEnabled();
  expect(screen.queryByText("Could not load players")).toBeNull();
  expect(writes).toEqual([]);
});

it("keeps player-fetch failures observable and refetches the roster before enabling results", async () => {
  peopleCode = 503;
  await mount(false);
  expect(await screen.findByText("Could not load players")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
  peopleCode = 200;
  await press("Try again");
  await ready();
  expect(screen.getByRole("button", { name: "Save result" })).toBeEnabled();
  expect(writes).toEqual([]);
});

it("loads a missing frozen participant through actual next-page controls without submitting a partial result", async () => {
  people = { items: [person("owner", 1)], nextCursor: "next-roster-page" };
  await mount();
  const more = await screen.findByRole("button", { name: "Load more players" });
  expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
  let finish: (response: Response) => void = () => {};
  pendingPeople = new Promise((resolve) => {
    finish = resolve;
  });
  await userEvent.setup().press(more);
  await waitFor(() => expect(more).toBeDisabled());
  await userEvent.setup().press(more);
  expect(reads.filter((read) => read.url.searchParams.has("cursor"))).toHaveLength(1);
  await act(async () => finish(Response.json(nextPeople)));
  pendingPeople = undefined;
  await ready();
  expect(screen.getByRole("button", { name: "Score: Guest Player" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more players" })).toBeNull();
  expect(writes).toEqual([]);
});

it("saves explicit scores once against the reviewed version and reconciles the receipt before returning", async () => {
  await mount();
  await ready();
  await press("Save result");
  await waitFor(() =>
    expect(boundary.dismissTo).toHaveBeenCalledExactlyOnceWith({
      pathname: "/event/table",
      params: { eventId: event.id, tableId: table.id },
    }),
  );
  expect(writes).toEqual([
    {
      path: `/api/events/${event.id}/tables/${table.id}/results`,
      input: {
        version: 1,
        lowerWins: false,
        entries: [
          { userId: "owner", score: "20" },
          { userId: "guest", score: "10" },
        ],
        tieBreaks: [],
      },
      authorization: "Bearer results-native-token",
    },
  ]);
  expect(client.getQueryData(eventRecordKeys.detail(options, event.id))).toMatchObject({
    version: 2,
    resultsReady: true,
  });
  expect(client.getQueryData(eventRecordKeys.table(options, event.id, table.id))).toMatchObject({
    eventVersion: 2,
    resultDraft: { entries: writes[0].input.entries },
  });
  expect(client.getQueryData(eventRecordKeys.table(options, event.id, table.id))).toMatchObject({
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  });
  expect(boundary.back).not.toHaveBeenCalled();
});

it("disables editing and Back while a score write is pending and refuses duplicate saves", async () => {
  let finish: (response: Response) => void = () => {};
  pendingWrite = new Promise((resolve) => {
    finish = resolve;
  });
  const back = vi.spyOn(BackHandler, "addEventListener");
  await mount();
  await ready();
  await press("Save result");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Score: Owner Player" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  const hardwareBack = back.mock.calls
    .filter(([eventName]) => eventName === "hardwareBackPress")
    .at(-1)?.[1];
  if (!hardwareBack) throw new Error("Expected the route's native hardware Back subscription");
  expect(hardwareBack({ type: "hardwareBackPress", timeStamp: Date.now() })).toBe(true);
  await press("Save result");
  await press("Back");
  expect(writes).toHaveLength(1);
  expect(boundary.back).not.toHaveBeenCalled();
  await act(async () => finish(Response.json(saveReceipt(writes[0].input))));
  await waitFor(() => expect(boundary.dismissTo).toHaveBeenCalledOnce());
});

it("keeps a rejected score draft editable and retries only after another explicit save", async () => {
  writeCode = 400;
  await mount();
  await ready();
  await press("Save result");
  const editorHeader = screen.getByText(
    "Saved scores remain editable. Ratings and statistics update only when the event is finalized.",
  ).parent;
  if (!editorHeader) throw new Error("Expected the actual results editor header");
  const error = await within(editorHeader).findByText("Could not save table result");
  expect(error).toBeVisible();
  expect(error).toHaveProp("accessibilityRole", "alert");
  await waitFor(() => expect(screen.getByRole("button", { name: "Save result" })).toBeEnabled());
  expect(boundary.dismissTo).not.toHaveBeenCalled();
  expect(writes).toHaveLength(1);
  writeCode = 200;
  await press("Save result");
  await waitFor(() => expect(boundary.dismissTo).toHaveBeenCalledOnce());
  expect(writes).toHaveLength(2);
  expect(writes[1].input).toEqual(writes[0].input);
});

it("blocks an old reviewed draft when a newer authoritative event/table epoch arrives", async () => {
  await mount();
  await ready();
  event = { ...event, version: 2 };
  table = { ...table, eventVersion: 2 };
  await act(() => {
    client.setQueryData(eventRecordKeys.detail(options, event.id), event);
    client.setQueryData(eventRecordKeys.table(options, event.id, table.id), table);
  });
  expect(
    await screen.findByText("This event changed. Go back and reopen the editor before saving."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();
  await press("Save result");
  expect(writes).toEqual([]);
  expect(boundary.dismissTo).not.toHaveBeenCalled();
});

it("does not allow editing when the parent and frozen table versions cannot be reconciled", async () => {
  table = { ...table, eventVersion: 2 };
  await mount();
  expect(
    await screen.findByText("This event changed. Go back and reopen the editor before saving."),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
  expect(writes).toEqual([]);
});

it("applies a same-version live capability revocation before accepting any score action", async () => {
  await mount();
  await ready();
  event = { ...event, canFinalize: false };
  await act(() => client.setQueryData(eventRecordKeys.detail(options, event.id), event));
  expect(await screen.findByText(denied)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save result" })).toBeNull();
  expect(writes).toEqual([]);
});

it("shows an uncertain saved-score state without replaying the pending result", async () => {
  const input: SaveTableResultInput = {
    version: 1,
    lowerWins: false,
    entries: [
      { userId: "owner", score: "30" },
      { userId: "guest", score: "10" },
    ],
    tieBreaks: [],
  };
  client.getMutationCache().build(
    client,
    { mutationKey: eventRecordKeys.mutation(options, event.id, "save-result") },
    {
      context: undefined,
      data: undefined,
      error: new CommunityApiError(502, "MUTATION_OUTCOME_UNKNOWN"),
      failureCount: 1,
      failureReason: new CommunityApiError(502, "MUTATION_OUTCOME_UNKNOWN"),
      isPaused: false,
      status: "error",
      submittedAt: Date.now(),
      variables: { tableId: table.id, input },
    },
  );
  await mount();
  await ready();
  expect(screen.getByText("Checking saved changes")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Score: Owner Player" })).toBeDisabled();
  expect(writes).toEqual([]);
  expect(boundary.dismissTo).not.toHaveBeenCalled();
});
