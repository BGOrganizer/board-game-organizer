import { URL } from "node:url";
import type {
  EventProposalResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  eventRecordQuery,
  recordTableQuery,
  type SubmitEventProposalVariables,
} from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import type { AndroidNativeProps } from "@react-native-community/datetimepicker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { EventJoinSheet } from "@/components/events/EventJoinSheet";
import { EventProposalEditor } from "@/components/events/EventProposalEditor";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable, seat } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const API = "https://participation-owner-performance.test";
const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "fixture-participation-owner"),
  back: vi.fn(),
  replace: vi.fn(),
  canGoBack: vi.fn(() => true),
  picker: { open: vi.fn<(options: AndroidNativeProps) => void>(), dismiss: vi.fn() },
}));
const options = { apiUrl: API, userId: "owner", enabled: true, getToken: boundary.getToken };
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "participation-owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://participation-owner-performance.test" } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => boundary,
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({}),
  Stack: {
    Screen: ({
      options: config,
    }: {
      options: { headerLeft?: (props: { canGoBack: boolean }) => ReactNode };
    }) => <View>{config.headerLeft?.({ canGoBack: true })}</View>,
  },
}));
vi.mock("expo-router/react-navigation", async (original) => ({
  ...(await original<typeof import("expo-router/react-navigation")>()),
  usePreventRemove: () => {},
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: boundary.picker,
}));
vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
}));
vi.mock("@maplibre/maplibre-react-native", () => {
  const unavailable = () => {
    throw new Error("Date proposals do not mount a native GPU map");
  };
  return { Map: unavailable, Camera: unavailable, GeoJSONSource: unavailable, Layer: unavailable };
});
const wrapperFor =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <NativeTestProviders>{children}</NativeTestProviders>
    </QueryClientProvider>
  );
const clientForScenario = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
function reset(client: QueryClient) {
  client.clear();
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fixture-participation-owner");
  boundary.canGoBack.mockReturnValue(true);
}
const urlFor = (input: RequestInfo | URL) =>
  new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
const press = async (name: string) =>
  userEvent.setup().press(await screen.findByRole("button", { name }));
async function chooseDate() {
  await press("Choose date and time");
  const dateOptions = boundary.picker.open.mock.calls.at(-1)?.[0];
  if (!dateOptions?.onChange) throw new Error("Expected the actual field's Android date callback");
  const date = new Date("2030-06-05T00:00:00Z");
  await act(() =>
    dateOptions.onChange?.(
      { type: "set", nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } },
      date,
    ),
  );
  const timeOptions = boundary.picker.open.mock.calls.at(-1)?.[0];
  if (!timeOptions?.onChange || timeOptions.mode !== "time")
    throw new Error("Expected actual second-stage Android time selection");
  const time = new Date("2030-06-05T18:15:00Z");
  await act(() =>
    timeOptions.onChange?.(
      { type: "set", nativeEvent: { timestamp: time.getTime(), utcOffset: 0 } },
      time,
    ),
  );
}
const denied =
  "Proposals require an enabled category and your own seated participation in a private planning event.";
const proposedDate = { kind: "date" as const, day: "2030-06-05", startTime: "18:15" };
function proposalEvent(): PlannedEventResponse {
  return {
    ...plannedEvent,
    adminUserId: "event-manager",
    role: "participant",
    canManage: false,
    canEdit: false,
    canInvite: false,
    canRegister: false,
    canVote: true,
    participantCount: 1,
    myRegistrations: [{ ...seat("owner"), kind: "SELF" }],
    canProposeDates: true,
    allowParticipantDates: true,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Actual Gorhom opening requires UI-thread reactions missing from the Node SDK
// boundary. This measures rendered consent/form state, not sheet visibility,
// physical taps, native opening latency or the parent navigator's teardown.
it("EventJoinSheet: incomplete ballots, explicit votes and pending registration reconcile the authoritative seat", async () => {
  const client = clientForScenario();
  const close = vi.fn();
  let event: PlannedEventResponse;
  let table: PlannedTableResponse;
  let release: (response: Response) => void = () => {};
  let pending: Promise<Response>;
  const writes: { path: string; body: unknown }[] = [],
    unexpected: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlFor(input);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fixture-participation-owner",
      );
      if (
        url.origin === API &&
        init?.method === "POST" &&
        url.pathname === `/api/events/${plannedEvent.id}/tables/${plannedTable.id}/registrations`
      ) {
        writes.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
        return pending;
      }
      if (url.origin === API && (init?.method ?? "GET") === "GET") {
        if (url.pathname === `/api/events/${plannedEvent.id}`) return Response.json(event);
        if (url.pathname === `/api/events/${plannedEvent.id}/tables/${plannedTable.id}`)
          return Response.json(table);
        if (url.pathname === `/api/events/${plannedEvent.id}/tables`)
          return Response.json({ items: [table], nextCursor: null });
        if (url.pathname.endsWith("/seats")) return Response.json({ items: [], nextCursor: null });
      }
      unexpected.push(url.href);
      throw new Error(`Unexpected participation request ${url.href}`);
    }),
  );
  try {
    const result = await measureRenders(
      <EventJoinSheet eventId={plannedEvent.id} tableId={plannedTable.id} onClose={close} />,
      {
        wrapper: wrapperFor(client),
        beforeEach: () => {
          reset(client);
          close.mockReset();
          writes.length = unexpected.length = 0;
          event = {
            ...plannedEvent,
            myRegistrations: [],
            myVotes: { dateVotes: {}, locationVotes: {} },
          };
          table = {
            ...plannedTable,
            games: [...plannedTable.games, { gameId: 2, durationMinutes: 30 }],
            gamesDetail: [
              ...plannedTable.gamesDetail,
              { id: 2, name: "Second chess", imageUrl: null, year: null },
            ],
          };
          client.setQueryData(eventRecordQuery(options, event.id).queryKey, event);
          client.setQueryData(recordTableQuery(options, event.id, table.id).queryKey, table);
          pending = new Promise<Response>((resolve) => {
            release = resolve;
          });
        },
        scenario: async () => {
          await waitFor(() => expect(screen.getByTestId("table-consent-submit")).toBeEnabled());
          expect(screen.getByRole("tab", { name: "Games" })).toBeSelected();
          expect(writes).toEqual([]);
          await press("Join table");
          expect(
            screen.getByText(
              "Answer every option and choose at least one Yes or If needed in each section.",
            ),
          ).toBeOnTheScreen();
          expect(writes).toEqual([]);
          await press("Chess: Yes");
          await press("Second chess: No");
          expect(screen.getByRole("button", { name: "Chess: Yes" })).toBeSelected();
          await press("Join table");
          await waitFor(() => expect(writes).toHaveLength(1));
          expect(writes[0]).toEqual({
            path: `/api/events/${event.id}/tables/${table.id}/registrations`,
            body: {
              version: event.version,
              gameVotes: { "1": "YES", "2": "NO" },
              availability: { version: event.version, dateVotes: {}, locationVotes: {} },
            },
          });
          expect(close).toHaveBeenCalledOnce();
          expect(client.isMutating()).toBeGreaterThan(0);
          expect(screen.getByTestId("table-consent-submit")).toBeDisabled();
          await userEvent.setup().press(screen.getByTestId("table-consent-submit"));
          expect(writes).toHaveLength(1);
          const registration = {
            ...seat("owner"),
            kind: "SELF" as const,
            gameVotes: { "1": "YES" as const, "2": "NO" as const },
          };
          event = { ...event, version: event.version + 1, myRegistrations: [registration] };
          table = {
            ...table,
            canRegister: false,
            myRegistration: registration,
            myPosition: "SEATED",
            seatedCount: 1,
            acceptedCount: 1,
          };
          await act(() => release(Response.json({ ...registration, eventVersion: event.version })));
          await waitFor(() => expect(client.isMutating()).toBe(0));
          const saved = client.getQueryData<PlannedTableResponse>(
            recordTableQuery(options, event.id, table.id).queryKey,
          );
          expect(saved?.myRegistration).toMatchObject({
            userId: "owner",
            status: "ACCEPTED",
            gameVotes: { "1": "YES", "2": "NO" },
          });
          expect(writes).toHaveLength(1);
          expect(unexpected).toEqual([]);
        },
      },
    );
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});

it("EventProposalEditor: invalid date, Android selection and pending proposal preserve the authenticated server receipt", async () => {
  const client = clientForScenario();
  const event = proposalEvent();
  const writes: SubmitEventProposalVariables[] = [],
    unexpected: string[] = [];
  let release: (response: Response) => void = () => {};
  let pending: Promise<Response>;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlFor(input);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fixture-participation-owner",
      );
      if (
        url.origin === API &&
        url.pathname === `/api/events/${event.id}/proposals` &&
        init?.method === "POST"
      ) {
        writes.push(JSON.parse(String(init.body)));
        return pending;
      }
      if (
        url.origin === API &&
        url.pathname === `/api/events/${event.id}` &&
        (init?.method ?? "GET") === "GET"
      )
        return Response.json(event);
      unexpected.push(url.href);
      throw new Error(`Unexpected date proposal request ${url.href}`);
    }),
  );
  try {
    const result = await measureRenders(<EventProposalEditor eventId={event.id} kind="date" />, {
      wrapper: wrapperFor(client),
      beforeEach: () => {
        reset(client);
        writes.length = unexpected.length = 0;
        client.setQueryData(eventRecordQuery(options, event.id).queryKey, event);
        pending = new Promise<Response>((resolve) => {
          release = resolve;
        });
      },
      scenario: async () => {
        await press("Send proposal");
        expect(screen.getByText("Choose a valid date and time.")).toBeVisible();
        expect(writes).toEqual([]);
        await chooseDate();
        await press("Send proposal");
        await waitFor(() => expect(writes).toHaveLength(1));
        expect(writes[0]).toMatchObject({
          eventVersion: event.version,
          payload: proposedDate,
          clientRequestId: expect.any(String),
        });
        expect(boundary.back).toHaveBeenCalledOnce();
        expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
        expect(client.isMutating()).toBeGreaterThan(0);
        const receipt: EventProposalResponse = {
          id: "77777777-7777-4777-8777-777777777777",
          clientRequestId: writes[0].clientRequestId ?? "",
          userId: "owner",
          eventId: event.id,
          groupId: event.groupId,
          payload: proposedDate,
          label: "Proposed date",
          status: "PENDING",
          version: 1,
          submittedEventVersion: event.version,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          authorName: "Owner Player",
          authorUsername: "owner",
        };
        await act(() => release(Response.json(receipt)));
        await waitFor(() => expect(client.isMutating()).toBe(0));
        const saved = client
          .getMutationCache()
          .getAll()
          .find(
            (mutation) =>
              (mutation.state.data as EventProposalResponse | undefined)?.id === receipt.id,
          );
        expect(saved?.state.status).toBe("success");
        expect(saved?.state.data).toMatchObject({
          id: receipt.id,
          clientRequestId: writes[0].clientRequestId,
          status: "PENDING",
          payload: proposedDate,
        });
        expect(writes).toHaveLength(1);
        expect(unexpected).toEqual([]);
        expect(boundary.replace).not.toHaveBeenCalled();
      },
    });
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});

it("EventProposalEditor: authoritative category revocation removes the draft action without submitting consent", async () => {
  const client = clientForScenario();
  let event = proposalEvent();
  const reads: string[] = [],
    writes: string[] = [],
    unexpected: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlFor(input),
        method = init?.method ?? "GET";
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fixture-participation-owner",
      );
      if (method !== "GET") writes.push(url.pathname);
      if (url.origin === API && url.pathname === `/api/events/${event.id}` && method === "GET") {
        reads.push(url.pathname);
        return Response.json(event);
      }
      unexpected.push(url.href);
      throw new Error(`Unexpected revoked proposal request ${url.href}`);
    }),
  );
  try {
    const result = await measureRenders(
      <EventProposalEditor eventId={plannedEvent.id} kind="date" />,
      {
        wrapper: wrapperFor(client),
        beforeEach: () => {
          reset(client);
          event = proposalEvent();
          reads.length = writes.length = unexpected.length = 0;
          client.setQueryData(eventRecordQuery(options, event.id).queryKey, event);
        },
        scenario: async () => {
          await screen.findByRole("button", { name: "Send proposal" });
          await chooseDate();
          expect(writes).toEqual([]);
          event = {
            ...event,
            version: event.version + 1,
            canProposeDates: false,
            allowParticipantDates: false,
          };
          await act(() =>
            client.refetchQueries({
              queryKey: eventRecordQuery(options, event.id).queryKey,
              exact: true,
            }),
          );
          expect(await screen.findByText(denied)).toBeVisible();
          expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
          expect(
            client.getQueryData<PlannedEventResponse>(eventRecordQuery(options, event.id).queryKey),
          ).toMatchObject({ version: 2, canProposeDates: false });
          expect(reads).toHaveLength(1);
          expect(writes).toEqual([]);
          await press("Cancel");
          expect(boundary.back).toHaveBeenCalledOnce();
          expect(unexpected).toEqual([]);
        },
      },
    );
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});
