import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, userEvent } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventCard } from "../EventCard";
import { EventTableCard } from "../EventTableCard";

const sdk = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({
  useRouter: () => sdk,
  useLocalSearchParams: () => ({}),
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
let client: QueryClient;
beforeEach(() => {
  sdk.push.mockClear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Card origin navigation must not write or read remote state");
    }),
  );
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["personal", "group"] as const)(
  "routes a real Event card from %s with only its explicit Group origin",
  async (context) => {
    const event = {
      ...plannedEvent,
      groupId: groupRecord.id,
      groupName: groupRecord.name,
      groupType: groupRecord.type,
    };
    await render(
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <EventCard event={event} context={context} />
        </NativeTestProviders>
      </QueryClientProvider>,
    );
    await userEvent.setup().press(
      screen.getByRole("button", {
        name: `Open event: ${plannedEvent.name}`,
      }),
    );
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith({
      pathname: "/event/[eventId]",
      params: {
        eventId: plannedEvent.id,
        ...(context === "group" ? { fromGroup: groupRecord.id } : {}),
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(["personal", "event"] as const)(
  "routes a real Table card from %s with only its explicit Event origin",
  async (context) => {
    await render(
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <EventTableCard table={plannedTable} context={context} />
        </NativeTestProviders>
      </QueryClientProvider>,
    );
    await userEvent.setup().press(
      screen.getByRole("button", {
        name: "Open table: Table #1",
      }),
    );
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith({
      pathname: "/event/table",
      params: {
        eventId: plannedTable.eventId,
        tableId: plannedTable.id,
        ...(context === "event" ? { fromEvent: plannedTable.eventId } : {}),
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("does not invent a Group origin for an event without any canonical parent group", async () => {
  expect(plannedEvent.groupId).toBeNull();
  await render(
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventCard event={plannedEvent} context="group" />
      </NativeTestProviders>
    </QueryClientProvider>,
  );
  await userEvent
    .setup()
    .press(screen.getByRole("button", { name: `Open event: ${plannedEvent.name}` }));
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/event/[eventId]",
    params: { eventId: plannedEvent.id },
  });
  expect(fetch).not.toHaveBeenCalled();
});
