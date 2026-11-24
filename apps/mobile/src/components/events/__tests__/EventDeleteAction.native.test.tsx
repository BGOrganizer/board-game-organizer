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
import { beginOptimisticOperation } from "../../../../../../packages/shared/src/common/optimisticOperation";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventDeleteAction } from "../EventDeleteAction";

const API = "https://event-delete-fixtures.test";
const boundary = vi.hoisted(() => ({
  dismissTo: vi.fn(),
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
const options = {
  apiUrl: API,
  userId: "owner",
  enabled: true,
  getToken: async () => "fixture-delete-token",
  feedback: boundary.feedback,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: boundary.dismissTo }) }));
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let code: number;
let pending: Promise<Response> | undefined;
const writes: { path: string; input: unknown; authorization: string | null }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(async () => {
  vi.clearAllMocks();
  event = { ...plannedEvent, canManage: true, managementRole: "admin", tableCount: 2 };
  table = { ...plannedTable, canManage: true, managementRole: "admin" };
  code = 200;
  pending = undefined;
  writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(eventRecordKeys.detail(options, event.id), event);
  client.setQueryData(eventRecordKeys.table(options, event.id, table.id), table);
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin !== API ||
        init?.method !== "DELETE" ||
        ![`/api/events/${event.id}`, `/api/events/${event.id}/tables/${table.id}`].includes(
          url.pathname,
        )
      )
        throw new Error(`Unexpected deletion request ${url.pathname}`);
      writes.push({
        path: url.pathname,
        input: JSON.parse(String(init.body)),
        authorization: new Headers(init.headers).get("authorization"),
      });
      return (
        pending ??
        json(
          code !== 200
            ? { error: "Fixture deletion rejected" }
            : url.pathname.endsWith(table.id)
              ? { ...event, version: event.version + 1, tableCount: event.tableCount - 1 }
              : { id: event.id },
          code,
        )
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
}: Partial<ComponentProps<typeof EventDeleteAction>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventDeleteAction event={record} {...props} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
function uncertain(
  tableId?: string,
  version = 1,
  error = new CommunityApiError(502, "MUTATION_OUTCOME_UNKNOWN"),
) {
  return client.getMutationCache().build(
    client,
    {
      mutationKey: eventRecordKeys.mutation(options, event.id, tableId ? "remove-table" : "remove"),
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
      variables: { version, ...(tableId ? { tableId } : {}) },
    },
  );
}

it.each(["event", "table"] as const)(
  "requires explicit %s deletion consent and leaves cancellation side-effect free",
  async (kind) => {
    const label = kind === "table" ? "Delete table" : "Delete event";
    await render(<Fixture table={kind === "table" ? table : undefined} />);
    const trigger = screen.getByRole("button", { name: label });
    expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44 });
    await userEvent.setup().press(trigger);
    expect(
      screen.getByText(
        kind === "table"
          ? "Delete this table and cancel its active registrations?"
          : "Permanently delete this event, all its tables, registrations and votes?",
      ),
    ).toBeVisible();
    expect(writes).toHaveLength(0);
    await press("Cancel");
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    expect(writes).toHaveLength(0);
    expect(boundary.dismissTo).not.toHaveBeenCalled();
  },
);

it.each(["event", "group-event", "table"] as const)(
  "deletes only the selected %s with its version and returns to the appropriate owning list",
  async (kind) => {
    if (kind === "group-event")
      event = { ...event, groupId: "99999999-9999-4999-8999-999999999999" };
    const label = kind === "table" ? "Delete table" : "Delete event";
    await render(<Fixture table={kind === "table" ? table : undefined} />);
    await press(label);
    await userEvent
      .setup()
      .press(
        within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name: label }),
      );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      path: `/api/events/${event.id}${kind === "table" ? `/tables/${table.id}` : ""}`,
      input: { version: 1 },
      authorization: "Bearer fixture-delete-token",
    });
    expect(boundary.dismissTo).toHaveBeenCalledWith(
      kind === "table"
        ? { pathname: "/event/[eventId]", params: { eventId: event.id } }
        : kind === "group-event"
          ? { pathname: "/group/[groupId]", params: { groupId: event.groupId, tab: "events" } }
          : "/(tabs)/events",
    );
  },
);

it.each([
  "no-manager",
  "read-only",
  "confirmed",
  "terminated",
  "table-read-only",
  "table-no-manager",
  "wrong-parent",
  "table-confirmed",
] as const)(
  "withholds deletion when the current authoritative %s boundary denies it",
  async (reason) => {
    const withTable = reason.startsWith("table") || reason === "wrong-parent";
    if (reason === "no-manager") event = { ...event, canManage: false, managementRole: null };
    else if (reason === "read-only") event = { ...event, readOnly: true };
    else if (reason === "confirmed" || reason === "terminated")
      event = { ...event, status: reason === "confirmed" ? "CONFIRMED" : "TERMINATED" };
    else if (reason === "table-read-only") table = { ...table, readOnly: true };
    else if (reason === "table-no-manager")
      table = { ...table, canManage: false, managementRole: null };
    else if (reason === "wrong-parent")
      table = { ...table, eventId: "88888888-8888-4888-8888-888888888888" };
    else table = { ...table, eventStatus: "CONFIRMED" };
    await render(<Fixture table={withTable ? table : undefined} />);
    expect(screen.queryByRole("button", { name: /Delete (event|table)/ })).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it.each([
  {
    reason: "last-table",
    message: "An event must keep at least one table. Delete the event instead.",
  },
  { reason: "cannot-edit", message: "This event can no longer be edited." },
  { reason: "unverified", message: "Wait until current event and table data are verified." },
] as const)(
  "explains the $reason guard through the real availability popover without submitting a delete",
  async ({ reason, message }) => {
    if (reason === "last-table") event = { ...event, tableCount: 1 };
    else if (reason === "cannot-edit") event = { ...event, canEdit: false };
    await render(
      <Fixture
        table={reason === "last-table" ? table : undefined}
        disabled={reason === "unverified"}
      />,
    );
    await pressMeasuredPopover(
      screen.getByRole("button", {
        name: reason === "last-table" ? "Delete table" : "Delete event",
      }),
    );
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Deletion availability" })).toBeVisible();
    expect(writes).toHaveLength(0);
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  },
);

it("reports another actual journal operation as busy and restores deletion after that operation rolls back", async () => {
  const resource = [...eventRecordKeys.root(options), event.id];
  const operation = await beginOptimisticOperation(client, resource, {
    queryKey: eventRecordKeys.root(options),
  });
  const view = await render(<Fixture />);
  await pressMeasuredPopover(screen.getByRole("button", { name: "Delete event" }));
  expect(screen.getByText("Another event action is in progress.")).toBeVisible();
  await act(() => operation.rollback());
  await view.rerender(<Fixture />);
  expect(screen.queryByRole("heading", { name: "Deletion availability" })).toBeNull();
  expect(writes).toHaveLength(0);
});

it.each(["event", "table"] as const)(
  "never retries an uncertain previous %s deletion from cached mutation state",
  async (kind) => {
    uncertain(kind === "table" ? table.id : undefined);
    await render(<Fixture table={kind === "table" ? table : undefined} />);
    expect(screen.getByText("Verifying")).toBeVisible();
    await pressMeasuredPopover(
      screen.getByRole("button", { name: kind === "table" ? "Delete table" : "Delete event" }),
    );
    expect(
      screen.getByText("Checking whether the previous deletion was saved. Do not submit it again."),
    ).toBeVisible();
    expect(writes).toHaveLength(0);
  },
);

it("does not use a different table's uncertain intent to block this table", async () => {
  uncertain("88888888-8888-4888-8888-888888888888");
  await render(<Fixture table={table} />);
  expect(screen.queryByText("Verifying")).toBeNull();
  await press("Delete table");
  expect(screen.getByTestId("confirmation-dialog")).toBeVisible();
});

it("stops showing an old uncertain deletion after a newer canonical event revision makes it obsolete", async () => {
  uncertain();
  event = { ...event, version: 2 };
  await render(<Fixture />);
  expect(screen.queryByText("Verifying")).toBeNull();
  await press("Delete event");
  expect(screen.getByTestId("confirmation-dialog")).toBeVisible();
});

it.each(["version", "authority", "disabled"] as const)(
  "closes a captured deletion decision when %s changes before confirmation",
  async (change) => {
    const record = event;
    const view = await render(<Fixture event={record} />);
    await press("Delete event");
    expect(screen.getByTestId("confirmation-dialog")).toBeVisible();
    await view.rerender(
      <Fixture
        event={{
          ...record,
          ...(change === "version"
            ? { version: 2 }
            : change === "authority"
              ? { canManage: false, managementRole: null }
              : {}),
        }}
        disabled={change === "disabled"}
      />,
    );
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it("coalesces deletion consent while its actual backend request is pending", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await press("Delete event");
  const consent = within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
    name: "Delete event",
  });
  // Deliver both presses before the native host commits the dialog's removal.
  await act(async () => {
    await Promise.all([fireEvent.press(consent), fireEvent.press(consent)]);
  });
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  await act(() => finish(json({ id: event.id })));
  expect(writes).toHaveLength(1);
  expect(boundary.dismissTo).toHaveBeenCalledOnce();
});

it("keeps a known rejection observable through the real action feedback without inventing a successful server delete", async () => {
  code = 400;
  await render(<Fixture />);
  await press("Delete event");
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Delete event",
    }),
  );
  await waitFor(() => expect(boundary.feedback.onError).toHaveBeenCalled());
  expect(writes).toHaveLength(1);
  expect(client.getQueryData(eventRecordKeys.detail(options, event.id))).toMatchObject({
    id: event.id,
    version: 1,
  });
});
