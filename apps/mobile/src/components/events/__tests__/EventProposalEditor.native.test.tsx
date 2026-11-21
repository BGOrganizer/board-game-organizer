import type {
  BggPickerItem,
  EventProposalResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  CommunityApiError,
  eventRecordKeys,
  type SubmitEventProposalVariables,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import type { AndroidNativeProps } from "@react-native-community/datetimepicker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type ComponentProps, type ReactNode, type Ref, useImperativeHandle } from "react";
import { View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { beginOptimisticOperation } from "../../../../../../packages/shared/src/common/optimisticOperation";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventProposalEditor } from "../EventProposalEditor";

const API = "https://proposal-editor-native.test";
const boundary = vi.hoisted(() => ({
  userId: "owner",
  back: vi.fn(),
  replace: vi.fn(),
  canGoBack: true,
  picker: { open: vi.fn(), dismiss: vi.fn() },
  easeTo: vi.fn(),
  getToken: vi.fn(),
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
const options = () => ({
  apiUrl: API,
  userId: boundary.userId,
  enabled: true,
  getToken: boundary.getToken,
  feedback: boundary.feedback,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: boundary.userId,
    sessionId: `session-${boundary.userId}`,
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({
    back: boundary.back,
    replace: boundary.replace,
    canGoBack: () => boundary.canGoBack,
  }),
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
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: "https://proposal-editor-native.test",
        maptilerApiKey: "fixture-public-map-key",
      },
    },
  },
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: boundary.picker,
}));
vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
}));
// Native/GPU MapLibre is outside the Node renderer. Preserve only its public
// hosts/camera API; LocationPicker and all application form code remain real.
vi.mock("@maplibre/maplibre-react-native", () => ({
  Map: View,
  GeoJSONSource: View,
  Layer: View,
  Camera: ({ ref }: { ref?: Ref<{ easeTo: typeof boundary.easeTo }> }) => {
    useImperativeHandle(ref, () => ({ easeTo: boundary.easeTo }), []);
    return <View />;
  },
}));
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let eventCode: number;
let tableCode: number;
let writeCode: number;
let pendingEvent: Promise<Response> | undefined;
const writes: {
  path: string;
  input: SubmitEventProposalVariables;
  authorization: string | null;
}[] = [];
const reads: URL[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const proposedDate = { kind: "date" as const, day: "2030-06-05", startTime: "18:15" };
const proposedGame: BggPickerItem = {
  id: 2,
  name: "Proposed game",
  imageUrl: null,
  year: 2024,
  source: "search",
};
beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.getState().clearPending();
  boundary.userId = "owner";
  boundary.canGoBack = true;
  boundary.getToken.mockResolvedValue("fixture-proposal-editor-token");
  eventCode = tableCode = writeCode = 200;
  pendingEvent = undefined;
  writes.length = reads.length = 0;
  event = {
    ...plannedEvent,
    role: "participant",
    canManage: false,
    canProposeDates: true,
    canProposeLocations: true,
    allowParticipantDates: true,
    allowParticipantLocations: true,
  };
  table = { ...plannedTable, canProposeGames: true, allowParticipantGames: true };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected proposal-editor origin ${url.origin}`);
      if (init?.method === "POST" && url.pathname === `/api/events/${event.id}/proposals`) {
        const body: SubmitEventProposalVariables = JSON.parse(String(init.body));
        writes.push({
          path: url.pathname,
          input: body,
          authorization: new Headers(init.headers).get("authorization"),
        });
        const receipt: EventProposalResponse = {
          id: "77777777-7777-4777-8777-777777777777",
          clientRequestId: body.clientRequestId ?? "",
          userId: boundary.userId,
          eventId: event.id,
          groupId: event.groupId,
          payload: body.payload,
          label:
            body.payload.kind === "date"
              ? "Proposed date"
              : body.payload.kind === "game"
                ? "Proposed game"
                : "Chosen club",
          status: "PENDING",
          version: 1,
          submittedEventVersion: event.version,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          authorName: "Owner Player",
          authorUsername: "owner",
        };
        return json(
          writeCode === 200 ? receipt : { error: "Fixture proposal rejected" },
          writeCode,
        );
      }
      reads.push(url);
      if (url.pathname === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          json(eventCode === 200 ? event : { error: "Fixture event unavailable" }, eventCode)
        );
      if (url.pathname === `/api/events/${event.id}/tables/${table.id}`)
        return json(tableCode === 200 ? table : { error: "Fixture table unavailable" }, tableCode);
      if (url.pathname === "/api/bgg/account") return json({ active: null, pending: null });
      if (url.pathname === "/api/bgg/picker")
        return json({
          items: [proposedGame, { ...proposedGame, id: 1, name: "Already selected game" }],
          nextCursor: null,
        });
      if (url.pathname === "/api/locations/favorites") return json({ items: [], nextCursor: null });
      if (url.pathname === "/api/locations/search")
        return json({
          items: [
            {
              id: "verified-rome",
              address: "Via Roma 1, Rome, Italy",
              longitude: 12.5,
              latitude: 41.9,
              timeZone: "Europe/Rome",
            },
          ],
        });
      throw new Error(`Unexpected proposal-editor read ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  useAppStore.getState().clearPending();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  kind = "date",
  eventId = event.id,
  ...props
}: Partial<ComponentProps<typeof EventProposalEditor>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventProposalEditor eventId={eventId} kind={kind} {...props} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function chooseDate() {
  await press("Choose date and time");
  const dateOptions = boundary.picker.open.mock.calls.at(-1)?.[0] as AndroidNativeProps;
  const day = new Date("2030-06-05T00:00:00Z");
  await act(() =>
    dateOptions.onChange?.(
      { type: "set", nativeEvent: { timestamp: day.getTime(), utcOffset: 0 } },
      day,
    ),
  );
  const timeOptions = boundary.picker.open.mock.calls.at(-1)?.[0] as AndroidNativeProps;
  const time = new Date("2030-06-05T18:15:00Z");
  await act(() =>
    timeOptions.onChange?.(
      { type: "set", nativeEvent: { timestamp: time.getTime(), utcOffset: 0 } },
      time,
    ),
  );
}
function recovery(payload: SubmitEventProposalVariables["payload"] = proposedDate, version = 1) {
  const error = new CommunityApiError(400, "Fixture unsent proposal");
  const variables: SubmitEventProposalVariables = {
    eventVersion: version,
    clientRequestId: "88888888-8888-4888-8888-888888888888",
    payload,
    clientLabel: "Recovered proposal",
  };
  return client.getMutationCache().build(
    client,
    {
      mutationKey: [
        ...eventRecordKeys.mutation(options(), event.id, "propose"),
        payload.kind,
        payload.kind === "game" ? table.id : null,
      ],
    },
    {
      context: undefined,
      data: undefined,
      error,
      failureCount: 1,
      failureReason: error,
      isPaused: false,
      status: "error",
      submittedAt: Date.now(),
      variables,
    },
  );
}
const denied =
  "Proposals require an enabled category and your own seated participation in a private planning event.";

it("validates an empty real date field before allowing proposal submission", async () => {
  await render(<Fixture />);
  await press("Send proposal");
  expect(screen.getByText("Choose a valid date and time.")).toBeVisible();
  expect(writes).toHaveLength(0);
  expect(boundary.back).not.toHaveBeenCalled();
});

it("submits an Android date/time choice through the real proposal mutation then unmounts the editor before native Back", async () => {
  await render(<Fixture />);
  await chooseDate();
  await press("Send proposal");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    path: `/api/events/${event.id}/proposals`,
    authorization: "Bearer fixture-proposal-editor-token",
    input: { eventVersion: 1, payload: proposedDate },
  });
  expect(boundary.back).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
});

it.each(["back", "fallback"] as const)(
  "cancels without a write using %s navigation",
  async (mode) => {
    boundary.canGoBack = mode === "back";
    await render(<Fixture />);
    await screen.findByRole("button", { name: "Send proposal" });
    await press("Cancel");
    expect(writes).toHaveLength(0);
    if (mode === "back") expect(boundary.back).toHaveBeenCalledOnce();
    else
      expect(boundary.replace).toHaveBeenCalledWith({
        pathname: "/event/[eventId]",
        params: { eventId: event.id },
      });
  },
);

it.each([
  "manager",
  "public",
  "read-only",
  "confirmed",
  "disabled-category",
  "limit",
  "unknown-kind",
  "missing-game-table",
] as const)(
  "withholds the proposal form when the %s eligibility boundary denies it",
  async (reason) => {
    if (reason === "manager") event = { ...event, canManage: true };
    else if (reason === "public") event = { ...event, groupType: "PUBLIC" };
    else if (reason === "read-only") event = { ...event, readOnly: true };
    else if (reason === "confirmed") event = { ...event, status: "CONFIRMED" };
    else if (reason === "disabled-category") event = { ...event, canProposeDates: false };
    else if (reason === "limit")
      event = {
        ...event,
        dates: Array.from({ length: 20 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          day: "2030-06-03",
          startTime: `${String(index).padStart(2, "0")}:00`,
        })),
      };
    await render(
      <Fixture
        kind={
          reason === "unknown-kind" ? "invalid" : reason === "missing-game-table" ? "game" : "date"
        }
      />,
    );
    expect(await screen.findByText(denied)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it("keeps an uncached event pending and exposes the field only after an authoritative successful response", async () => {
  let finish: (value: Response) => void = () => {};
  pendingEvent = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText(denied)).toBeNull();
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
  pendingEvent = undefined;
  await act(() => finish(json(event)));
  expect(await screen.findByRole("button", { name: "Send proposal" })).toBeEnabled();
});

it.each(["event", "table"] as const)(
  "keeps a denied %s request observable and retries the actual necessary source",
  async (source) => {
    if (source === "event") eventCode = 403;
    else tableCode = 403;
    await render(
      <Fixture
        kind={source === "table" ? "game" : "date"}
        tableId={source === "table" ? table.id : undefined}
      />,
    );
    expect(await screen.findByText(denied)).toBeVisible();
    eventCode = tableCode = 200;
    await press("Try again");
    if (source === "table") expect(await screen.findByTestId("game-search-input")).toBeVisible();
    else expect(await screen.findByRole("button", { name: "Send proposal" })).toBeEnabled();
  },
);

it("restores an unsent date proposal and reuses its idempotency key only for unchanged reviewed versions", async () => {
  const mutation = recovery();
  await render(<Fixture draftId={String(mutation.mutationId)} />);
  await press("Send proposal");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input.clientRequestId).toBe("88888888-8888-4888-8888-888888888888");
  expect(writes[0].input.payload).toEqual(proposedDate);
});

it("does not recover a proposal from an unrelated or missing draft identity", async () => {
  recovery({ kind: "game", tableId: table.id, gameId: 2 });
  await render(<Fixture draftId="missing-draft" />);
  expect(await screen.findByText(denied)).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("keeps real mutation failure observable for the owning feedback flow after editor close", async () => {
  writeCode = 400;
  await render(<Fixture />);
  await chooseDate();
  await press("Send proposal");
  await waitFor(() => expect(boundary.feedback.onError).toHaveBeenCalled());
  expect(writes).toHaveLength(1);
  expect(
    client
      .getMutationCache()
      .getAll()
      .some((mutation) => mutation.state.status === "error"),
  ).toBe(true);
});

it("picks a new canonical game using actual search while excluding the table's existing choices", async () => {
  boundary.canGoBack = false;
  await render(<Fixture kind="game" tableId={table.id} />);
  await screen.findByTestId("game-search-input");
  await fireEvent.changeText(screen.getByTestId("game-search-input"), "Proposed");
  expect(await screen.findByText("Proposed game")).toBeVisible();
  expect(screen.queryByText("Already selected game")).toBeNull();
  await press("Select: Proposed game");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input.payload).toEqual({ kind: "game", tableId: table.id, gameId: 2 });
  expect(boundary.replace).toHaveBeenCalledWith({
    pathname: "/event/table",
    params: { eventId: event.id, tableId: table.id },
  });
  expect(useAppStore.getState().pendingGame).toBeNull();
});

it("submits only a verified canonical location selected through the actual address search and form", async () => {
  await render(<Fixture kind="location" />);
  await screen.findByLabelText("Location name");
  await fireEvent.changeText(screen.getByLabelText("Location name"), "Chosen club");
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Rome");
  await userEvent.setup().press(await screen.findByTestId("address-result-0"));
  await press("Confirm Location");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input.payload).toMatchObject({
    kind: "location",
    location: {
      name: "Chosen club",
      address: "Via Roma 1, Rome, Italy",
      longitude: 12.5,
      latitude: 41.9,
      timeZone: "Europe/Rome",
    },
  });
  expect(boundary.back).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Location name")).toBeNull();
});

it("does not submit a previously chosen date after current server authority is revoked", async () => {
  await render(<Fixture />);
  await chooseDate();
  await act(() =>
    client.setQueryData(eventRecordKeys.detail(options(), event.id), {
      ...event,
      canProposeDates: false,
    }),
  );
  expect(await screen.findByText(denied)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
  expect(writes).toHaveLength(0);
});

it("preserves the chosen native date field across a live event revision and submits only the latest reviewed version", async () => {
  await render(<Fixture />);
  await chooseDate();
  const chosen = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date("2030-06-05T18:15:00Z"));
  const dateText = screen.getByText(chosen);
  const dateButton = screen.getByRole("button", { name: "Choose date and time" });
  const pickerCalls = boundary.picker.open.mock.calls.length;
  const readsBefore = reads.filter((url) => url.pathname === `/api/events/${event.id}`).length;
  event = { ...event, version: 2, name: "Freshly revised planning event" };
  await act(async () =>
    client.invalidateQueries({
      queryKey: eventRecordKeys.detail(options(), event.id),
      exact: true,
    }),
  );
  await waitFor(() =>
    expect(reads.filter((url) => url.pathname === `/api/events/${event.id}`)).toHaveLength(
      readsBefore + 1,
    ),
  );
  expect(screen.getByRole("button", { name: "Choose date and time" })).toBe(dateButton);
  expect(screen.getByText(chosen)).toBe(dateText);
  expect(boundary.picker.open).toHaveBeenCalledTimes(pickerCalls);
  expect(screen.getByRole("button", { name: "Send proposal" })).toBeEnabled();
  expect(writes).toHaveLength(0);
  await press("Send proposal");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toMatchObject({ eventVersion: 2, payload: proposedDate });
  expect(boundary.back).toHaveBeenCalledOnce();
});

it("retains a chosen native date while another canonical event operation blocks submission, then restores it after rollback", async () => {
  await render(<Fixture />);
  await chooseDate();
  const chosen = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date("2030-06-05T18:15:00Z"));
  const dateText = screen.getByText(chosen);
  const operation = await act(() =>
    beginOptimisticOperation(client, [...eventRecordKeys.root(options()), event.id, "write"], {
      queryKey: eventRecordKeys.root(options()),
    }),
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Send proposal" })).toBeDisabled());
  expect(screen.getByText(chosen)).toBe(dateText);
  await press("Send proposal");
  expect(writes).toHaveLength(0);
  expect(boundary.back).not.toHaveBeenCalled();
  await act(() => operation.rollback());
  await waitFor(() => expect(screen.getByRole("button", { name: "Send proposal" })).toBeEnabled());
  expect(screen.getByText(chosen)).toBe(dateText);
  await press("Send proposal");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input.payload).toEqual(proposedDate);
});

it("reconciles same-version server capability revocation and regrant without discarding the chosen date", async () => {
  await render(<Fixture />);
  await chooseDate();
  event = { ...event, canProposeDates: false };
  await act(async () =>
    client.invalidateQueries({
      queryKey: eventRecordKeys.detail(options(), event.id),
      exact: true,
    }),
  );
  expect(await screen.findByText(denied)).toBeVisible();
  expect(client.getQueryData(eventRecordKeys.detail(options(), event.id))).toMatchObject({
    version: 1,
    canProposeDates: false,
  });
  expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
  expect(writes).toHaveLength(0);
  event = { ...event, canProposeDates: true };
  await act(async () =>
    client.invalidateQueries({
      queryKey: eventRecordKeys.detail(options(), event.id),
      exact: true,
    }),
  );
  expect(await screen.findByRole("button", { name: "Send proposal" })).toBeEnabled();
  const chosen = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date("2030-06-05T18:15:00Z"));
  expect(screen.getByText(chosen)).toBeVisible();
  expect(writes).toHaveLength(0);
  await press("Send proposal");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toMatchObject({ eventVersion: 1, payload: proposedDate });
});
