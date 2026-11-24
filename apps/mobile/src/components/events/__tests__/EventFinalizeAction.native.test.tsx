import { URL } from "node:url";
import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { CommunityApiError, eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventFinalizeAction } from "../EventFinalizeAction";

const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "finalize-native-token"),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "finalize-owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: "https://finalize-native.test" } },
  },
}));
const options = {
  apiUrl: "https://finalize-native.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
let client: QueryClient;
let event: PlannedEventResponse;
let frozenTable: PlannedTableResponse;
let status: number;
let pendingResponse: Promise<Response> | undefined;
const writes: { path: string; input: unknown; authorization: string | null }[] = [];
function terminated(): PlannedEventResponse {
  return {
    ...event,
    status: "TERMINATED",
    version: event.version + 1,
    canFinalize: false,
    readOnly: true,
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  status = 200;
  pendingResponse = undefined;
  writes.length = 0;
  event = {
    ...plannedEvent,
    status: "CONFIRMED",
    canManage: true,
    managementRole: "admin",
    canFinalize: true,
    resultsReady: true,
    groupId: "33333333-3333-4333-8333-333333333333",
    groupType: "PRIVATE",
    visibility: "PRIVATE",
    confirmed: {
      dateId: plannedEvent.dates[0].id,
      locationId: plannedEvent.locations[0].id,
      at: "2030-06-02T12:00:00Z",
    },
  };
  frozenTable = {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    eventVersion: 1,
    confirmed: {
      gameId: 1,
      playerIds: ["owner", "guest"],
      startsAt: "2030-06-03T18:00:00Z",
    },
    resultDraft: {
      lowerWins: false,
      entries: [
        { userId: "owner", score: "20" },
        { userId: "guest", score: "10" },
      ],
      tieBreaks: [],
    },
  };
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(eventRecordKeys.detail(options, event.id), event);
  client.setQueryData(eventRecordKeys.table(options, event.id, frozenTable.id), frozenTable);
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin !== options.apiUrl ||
        url.pathname !== `/api/events/${event.id}/results` ||
        init?.method !== "POST"
      )
        throw new Error(`Unexpected finalization request: ${init?.method ?? "GET"} ${url.href}`);
      writes.push({
        path: url.pathname,
        input: JSON.parse(String(init.body)),
        authorization: new Headers(init.headers).get("authorization"),
      });
      return (
        pendingResponse ??
        Response.json(status === 200 ? terminated() : { error: "Finalization rejected" }, {
          status,
        })
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  event: record = event,
  ...props
}: Partial<ComponentProps<typeof EventFinalizeAction>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventFinalizeAction event={record} {...props} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
async function open() {
  await press("Finalize event");
  return screen.getByTestId("confirmation-dialog");
}
async function confirm() {
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Finalize event",
    }),
  );
}

it.each(["non-manager", "read-only", "planning", "terminated"] as const)(
  "withholds the action for a current %s projection without reading or changing results",
  async (reason) => {
    if (reason === "non-manager") event = { ...event, canManage: false, managementRole: null };
    else if (reason === "read-only") event = { ...event, readOnly: true };
    else
      event = {
        ...event,
        status: reason === "planning" ? "PLANNING" : "TERMINATED",
      };
    await render(<Fixture />);
    expect(screen.queryByRole("button", { name: "Finalize event" })).toBeNull();
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    expect(writes).toEqual([]);
    expect(boundary.getToken).not.toHaveBeenCalled();
  },
);

it.each([false, undefined] as const)(
  "explains missing included-table results when readiness is %s through the real availability popover",
  async (resultsReady) => {
    event = { ...event, resultsReady };
    await render(<Fixture />);
    expect(screen.queryByRole("button", { name: "Finalize event" })).toBeNull();
    await pressMeasuredPopover(
      screen.getByRole("button", { name: "Why finalization is unavailable" }),
    );
    expect(
      screen.getByText(
        "Save results for every included table before finalizing. Excluded tables do not require results.",
      ),
    ).toBeVisible();
    expect(writes).toEqual([]);
  },
);

it.each(["disabled", "capability"] as const)(
  "blocks the %s boundary before consent",
  async (reason) => {
    if (reason === "capability") event = { ...event, canFinalize: false };
    await render(<Fixture disabled={reason === "disabled"} />);
    expect(screen.getByRole("button", { name: "Finalize event" })).toBeDisabled();
    await press("Finalize event");
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    expect(writes).toEqual([]);
  },
);

it("requires explicit consent, keeps sharing opt-in and resets it after cancellation", async () => {
  await render(<Fixture />);
  await open();
  expect(
    screen.getByText("Results and ratings for all included tables become immutable together."),
  ).toBeVisible();
  const share = screen.getByRole("switch", {
    name: "Share results with participants' friends",
  });
  expect(share).not.toBeChecked();
  await userEvent.setup().press(share);
  expect(share).toBeChecked();
  expect(writes).toEqual([]);
  await press("Cancel");
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  await open();
  expect(
    screen.getByRole("switch", {
      name: "Share results with participants' friends",
    }),
  ).not.toBeChecked();
  expect(writes).toEqual([]);
  expect(client.getQueryData(eventRecordKeys.table(options, event.id, frozenTable.id))).toBe(
    frozenTable,
  );
});

it.each([false, true])(
  "finalizes private results once with explicit shareResultsWithFriends=%s",
  async (share) => {
    await render(<Fixture />);
    await open();
    if (share)
      await userEvent.setup().press(
        screen.getByRole("switch", {
          name: "Share results with participants' friends",
        }),
      );
    await confirm();
    await waitFor(() => expect(screen.queryByTestId("confirmation-dialog")).toBeNull());
    expect(writes).toEqual([
      {
        path: `/api/events/${event.id}/results`,
        input: { version: 1, shareResultsWithFriends: share },
        authorization: "Bearer finalize-native-token",
      },
    ]);
    expect(client.getQueryData(eventRecordKeys.detail(options, event.id))).toMatchObject({
      status: "TERMINATED",
      version: 2,
      readOnly: true,
    });
    expect(client.getQueryData(eventRecordKeys.table(options, event.id, frozenTable.id))).toEqual(
      frozenTable,
    );
  },
);

it.each(["public-group", "ungrouped"] as const)(
  "does not invent private sharing consent for an %s event",
  async (scope) => {
    event =
      scope === "public-group"
        ? { ...event, groupType: "PUBLIC", visibility: "PUBLIC" }
        : { ...event, groupId: null, groupType: null };
    client.setQueryData(eventRecordKeys.detail(options, event.id), event);
    await render(<Fixture />);
    await open();
    expect(
      screen.queryByRole("switch", {
        name: "Share results with participants' friends",
      }),
    ).toBeNull();
    await confirm();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].input).toEqual({ version: 1 });
    await waitFor(() => expect(screen.queryByTestId("confirmation-dialog")).toBeNull());
  },
);

it("locks consent and coalesces repeated presses while the authorized finalization is pending", async () => {
  let finish: (response: Response) => void = () => {};
  pendingResponse = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  const confirmation = await open();
  const consent = within(confirmation).getByRole("button", { name: "Finalize event" });
  // Deliver the rapid second press before the real button commits its disabled state.
  await act(async () => {
    await Promise.all([fireEvent.press(consent), fireEvent.press(consent)]);
  });
  await waitFor(() => expect(writes).toHaveLength(1));
  const dialog = within(screen.getByTestId("confirmation-dialog"));
  expect(dialog.getByRole("button", { name: "Finalize event" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(
    screen.getByRole("switch", {
      name: "Share results with participants' friends",
    }),
  ).toBeDisabled();
  await confirm();
  await press("Cancel");
  expect(writes).toHaveLength(1);
  expect(screen.getByTestId("confirmation-dialog")).toBeVisible();
  await act(async () => finish(Response.json(terminated())));
  await waitFor(() => expect(screen.queryByTestId("confirmation-dialog")).toBeNull());
  expect(writes).toHaveLength(1);
});

it("rejects stale confirmation after an authoritative version change without finalizing the newer event", async () => {
  const view = await render(<Fixture />);
  await open();
  await userEvent.setup().press(
    screen.getByRole("switch", {
      name: "Share results with participants' friends",
    }),
  );
  event = { ...event, version: 2 };
  await act(() => client.setQueryData(eventRecordKeys.detail(options, event.id), event));
  await view.rerender(<Fixture />);
  expect(
    screen.getByText("This event changed. Close this confirmation and review the saved results."),
  ).toBeVisible();
  expect(
    within(screen.getByTestId("confirmation-dialog")).queryByRole("button", {
      name: "Finalize event",
    }),
  ).toBeNull();
  expect(
    screen.getByRole("switch", {
      name: "Share results with participants' friends",
    }),
  ).toBeDisabled();
  expect(writes).toEqual([]);
  await press("Cancel");
  await open();
  await confirm();
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toEqual({
    version: 2,
    shareResultsWithFriends: false,
  });
  await waitFor(() => expect(screen.queryByTestId("confirmation-dialog")).toBeNull());
});

it("keeps a rejected finalization observable and leaves frozen scores unchanged", async () => {
  status = 409;
  await render(<Fixture />);
  await open();
  await confirm();
  expect(
    await screen.findByText(
      "Could not verify event finalization. Refresh the event before retrying.",
    ),
  ).toBeVisible();
  await waitFor(() =>
    expect(
      within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
        name: "Cancel",
      }),
    ).toBeEnabled(),
  );
  expect(writes).toHaveLength(1);
  expect(client.getQueryData(eventRecordKeys.detail(options, event.id))).toMatchObject({
    status: "CONFIRMED",
    version: 1,
  });
  expect(client.getQueryData(eventRecordKeys.table(options, event.id, frozenTable.id))).toEqual(
    frozenTable,
  );
  await press("Cancel");
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
});

it("does not replay an uncertain saved finalization and replaces consent actions with checking state", async () => {
  await render(<Fixture />);
  await open();
  await act(() =>
    client.getMutationCache().build(
      client,
      {
        mutationKey: eventRecordKeys.mutation(options, event.id, "finalize"),
      },
      {
        context: undefined,
        data: undefined,
        error: new CommunityApiError(502, "MUTATION_OUTCOME_UNKNOWN"),
        failureCount: 1,
        failureReason: new CommunityApiError(502, "MUTATION_OUTCOME_UNKNOWN"),
        isPaused: false,
        status: "error",
        submittedAt: Date.now(),
        variables: { version: 1 },
      },
    ),
  );
  expect(await screen.findByText("Checking saved changes")).toBeVisible();
  expect(
    within(screen.getByTestId("confirmation-dialog")).queryByRole("button", {
      name: "Finalize event",
    }),
  ).toBeNull();
  expect(
    screen.getByRole("switch", {
      name: "Share results with participants' friends",
    }),
  ).toBeDisabled();
  expect(writes).toEqual([]);
});
