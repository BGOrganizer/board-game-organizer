import type {
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import {
  NotificationAttentionProvider,
  notificationAttentionQuery,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createContext, Profiler, type ReactNode, useContext, useMemo } from "react";
import { Text } from "react-native";
import { Uniwind } from "uniwind";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupCard } from "@/components/groups/GroupCard";
import { GroupIdentityCard } from "@/components/groups/GroupIdentityCard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventCard } from "../EventCard";
import { EventDetailsCard } from "../EventDetailsCard";
import { EventTableCard } from "../EventTableCard";
import { EventTableInfo } from "../EventTableInfo";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const AuthContext = createContext({ userId: "owner" });

vi.mock("expo-router", () => ({
  useRouter: () => navigation,
  useLocalSearchParams: () => ({}),
}));
// Clerk is the external session boundary; components still consume a real React context.
vi.mock("@clerk/expo", () => ({ useAuth: () => useContext(AuthContext) }));

type Resource = typeof groupRecord | typeof plannedEvent | typeof plannedTable;
type Kind = "group" | "event" | "table";
const base: Record<Kind, Resource> = {
  group: groupRecord,
  event: plannedEvent,
  table: plannedTable,
};
const labels = { group: "Open group", event: "Open event", table: "Open table" } as const;
const popoverLabels = {
  group: "Private",
  event: "Private event",
  table: "Rating enabled",
} as const;
const clients = new Set<QueryClient>();

function row(kind: Kind, record: Resource) {
  if (kind === "group") return <GroupCard group={record as typeof groupRecord} />;
  if (kind === "event") return <EventCard event={record as typeof plannedEvent} />;
  return <EventTableCard table={record as typeof plannedTable} />;
}
function navigationHosts(kind: Kind, translated = false) {
  const label = translated
    ? kind === "group"
      ? "Apri gruppo"
      : kind === "event"
        ? "Apri evento"
        : "Apri tavolo"
    : labels[kind];
  return screen.getAllByRole("button", {
    name: new RegExp(`^${label}:`),
    includeHiddenElements: true,
  });
}
function indicatorHosts(kind: Kind) {
  return screen.getAllByRole("button", { name: popoverLabels[kind], includeHiddenElements: true });
}
function expectSameHosts(
  actual: ReturnType<typeof navigationHosts>,
  expected: ReturnType<typeof navigationHosts>,
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((host, index) => {
    expect(host).toBe(expected[index]);
  });
}

function fixture(kind: Kind) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.add(client);
  const records: Resource[] = Array.from({ length: 8 }, (_, index) => ({
    ...base[kind],
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Resource ${index + 1}`,
  }));
  const targets: NotificationAttentionTarget[] = records.map(({ id }) => ({ kind, id }));
  const options = {
    apiUrl: "https://render-fixtures.test",
    userId: "owner",
    enabled: false,
    getToken: vi.fn(async () => "test-token"),
  };
  const queryKey = notificationAttentionQuery(options, targets).queryKey;
  const snapshot = (firstCount = 0): NotificationAttentionSnapshot => ({
    asOf: "2030-06-01T10:00:00.000Z",
    unreadCount: firstCount,
    summary: {
      tables: kind === "table" ? firstCount : 0,
      events: kind === "event" ? firstCount : 0,
      groups: kind === "group" ? firstCount : 0,
      contacts: 0,
      sections: { connections: 0, requests: 0, search: 0 },
    },
    targets: targets.map((target, index) => ({
      target,
      count: index ? 0 : firstCount,
      direct: index ? 0 : firstCount,
      events: 0,
      sections: { connections: 0, requests: 0, search: 0 },
    })),
  });
  client.setQueryData(queryKey, snapshot());
  function Harness({
    rows = records,
    locale = "en",
    userId = "owner",
    titleAction,
    children,
  }: {
    rows?: Resource[];
    locale?: "en" | "it";
    userId?: string;
    titleAction?: ReactNode;
    children?: ReactNode;
  }) {
    const identity = useMemo(() => ({ userId }), [userId]);
    return (
      <NativeTestProviders locale={locale}>
        <AuthContext value={identity}>
          <QueryClientProvider client={client}>
            <NotificationAttentionProvider options={options} targets={targets}>
              {children ??
                rows.map((record) => (
                  <Profiler
                    key={record.id}
                    id={record.id}
                    onRender={(_id, _phase, duration) => durations.push(duration)}
                  >
                    {row(kind, record)}
                  </Profiler>
                ))}
              {titleAction}
            </NotificationAttentionProvider>
          </QueryClientProvider>
        </AuthContext>
      </NativeTestProviders>
    );
  }
  const durations: number[] = [];
  return { client, records, options, queryKey, snapshot, Harness, durations };
}

beforeEach(installNativePopoverMeasurements);
afterEach(() => {
  vi.restoreAllMocks();
  for (const client of clients) client.clear();
  clients.clear();
  navigation.push.mockClear();
  Uniwind.setTheme("light");
});

// Host identity proves retained native controls, not skipped composite renders.
// v14 intentionally exposes no composite instances; inner memo calculation counts
// remain a separate Profiler/device regression requirement.
it.each(["group", "event", "table"] as const)(
  "real %s cards preserve native rows while cached records and attention stay reactive",
  async (kind) => {
    const f = fixture(kind);
    const view = await render(<f.Harness />);
    const originalNavigation = navigationHosts(kind);
    const originalIndicators = indicatorHosts(kind);
    expect(originalNavigation).toHaveLength(8);
    for (let revision = 0; revision < 5; revision++) {
      await act(() => f.client.setQueryData(f.queryKey, f.snapshot()));
      await view.rerender(<f.Harness titleAction={<Text>Revision {revision}</Text>} />);
    }
    expectSameHosts(navigationHosts(kind), originalNavigation);
    expectSameHosts(indicatorHosts(kind), originalIndicators);
    await act(() => f.client.setQueryData(f.queryKey, f.snapshot(1)));
    await waitFor(() => expect(screen.getByLabelText("Unread updates")).toBeTruthy());
    expectSameHosts(navigationHosts(kind), originalNavigation);
    const changed = f.records.map((record, index) =>
      index ? record : { ...record, name: "Updated name" },
    );
    await view.rerender(<f.Harness rows={changed} />);
    expect(screen.getByText("Updated name")).toBeVisible();
    expect(screen.queryByText("Resource 1")).toBeNull();
    expectSameHosts(navigationHosts(kind), originalNavigation);
    await pressMeasuredPopover(indicatorHosts(kind)[0]);
    expect(
      await screen.findByRole("heading", {
        name: kind === "table" ? "Rating" : popoverLabels[kind],
      }),
    ).toBeTruthy();
    expectSameHosts(navigationHosts(kind), originalNavigation);
    expectSameHosts(indicatorHosts(kind), originalIndicators);
    await view.rerender(<f.Harness rows={changed} locale="it" />);
    expect(navigationHosts(kind, true)).toHaveLength(8);
    expectSameHosts(navigationHosts(kind, true), originalNavigation);
    await act(() => Uniwind.setTheme("dark"));
    expect(navigationHosts(kind, true)).toHaveLength(8);
    expect(f.durations.length).toBeGreaterThan(0);
    expect(f.durations.every(Number.isFinite)).toBe(true);
    expect(f.options.getToken).not.toHaveBeenCalled();
  },
);

it.each(["group", "event", "table"] as const)(
  "real %s detail keeps controls through unrelated title actions and shows authoritative updates",
  async (kind) => {
    const f = fixture(kind),
      original = base[kind];
    const detail = (record: Resource, titleAction?: ReactNode) =>
      kind === "group" ? (
        <GroupIdentityCard group={record as typeof groupRecord} titleAction={titleAction} />
      ) : kind === "event" ? (
        <EventDetailsCard event={record as typeof plannedEvent} titleAction={titleAction} />
      ) : (
        <EventTableInfo table={record as typeof plannedTable} titleAction={titleAction} />
      );
    const view = await render(<f.Harness>{detail(original, <Text>Revision 0</Text>)}</f.Harness>);
    const stable = indicatorHosts(kind);
    for (let revision = 1; revision < 6; revision++) {
      await view.rerender(
        <f.Harness>{detail(original, <Text>Revision {revision}</Text>)}</f.Harness>,
      );
      expectSameHosts(indicatorHosts(kind), stable);
      expect(screen.getByText(`Revision ${revision}`)).toBeVisible();
    }
    await view.rerender(<f.Harness>{detail({ ...original, name: "Changed detail" })}</f.Harness>);
    expect(screen.getByRole("header", { name: "Changed detail" })).toBeTruthy();
    expectSameHosts(indicatorHosts(kind), stable);
  },
);

it("updates an already open table role explanation when the actual session context changes", async () => {
  const f = fixture("table");
  const rows = [{ ...f.records[0], demonstratorUserId: "owner" }];
  const view = await render(<f.Harness rows={rows} />);
  await pressMeasuredPopover(screen.getByRole("button", { name: "Roles and participation" }));
  expect(await screen.findByText("Demonstrator")).toBeVisible();
  await view.rerender(<f.Harness rows={rows} userId="another-user" />);
  expect(screen.queryByText("Demonstrator")).toBeNull();
  expect(screen.getByText("You are not registered.")).toBeVisible();
});
