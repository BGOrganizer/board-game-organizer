import type {
  NotificationAttentionCount,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { notificationItemId } from "@board-game-organizer/schemas";
import {
  groupRecordKeys,
  NotificationAttentionProvider,
  notificationAttentionQuery,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";
import { EventCard } from "@/components/events/EventCard";
import { EventTableCard } from "@/components/events/EventTableCard";
import { GroupCard } from "@/components/groups/GroupCard";
import { GroupDetail } from "@/components/groups/GroupDetail";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";

const options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
// This suite exercises marker ownership; the changes hook has separate transport/Alert tests.
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useNotificationChanges: () => ({
    changes: [],
    tabCounts: { details: 1, members: 1, tables: 0, participants: 0 },
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    isError: false,
    isReading: false,
    readError: undefined,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    markDisplayedAsRead: vi.fn(),
  }),
}));
const table = { kind: "table", id: plannedTable.id } as const,
  event = { kind: "event", id: plannedEvent.id } as const,
  group = { kind: "group", id: groupRecord.id } as const;
const targets = [table, event, group];
function counts(): NotificationAttentionSnapshot {
  const row = (
    target: NotificationAttentionTarget,
    count: number,
    direct: number,
  ): NotificationAttentionCount => ({
    target,
    count,
    direct,
    events: target.kind === "group" ? 3 : 0,
    sections: { connections: 0, requests: 0, search: 0 },
    ...(target.kind === "table" || target.kind === "event"
      ? { eventId: plannedEvent.id, groupId: groupRecord.id }
      : {}),
  });
  return {
    asOf: "2027-01-01T00:00:00.000Z",
    unreadCount: 4,
    summary: {
      tables: 2,
      events: 3,
      groups: 4,
      contacts: 0,
      sections: { connections: 0, requests: 0, search: 0 },
    },
    targets: [row(table, 2, 2), row(event, 3, 1), row(group, 4, 1)],
  };
}
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  client.setQueryData(notificationAttentionQuery(options, targets).queryKey, counts());
  return client;
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
it("omits zero/unknown, uses dots by default and preserves the bell's counted 99+ variant", () => {
  const view = renderWithI18n(
    <>
      <NotificationCountBadge count={0} />
      <NotificationCountBadge />
      <NotificationCountBadge count={130} counted />
      <NotificationCountBadge count={4} />
    </>,
  );
  expect(view.container.querySelectorAll("[data-slot=badge]")).toHaveLength(2);
  expect(screen.getByRole("img", { name: "Needs attention" }).textContent).toBe("");
  expect(screen.getByRole("img", { name: "Notifications: 130" }).textContent).toBe("99+");
  expect(screen.queryByText("0")).toBeNull();
});
it("places static unread dots after card titles inside navigation, including personal Tables", async () => {
  const client = setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(counts())),
  );
  renderWithI18n(
    <QueryClientProvider client={client}>
      <NotificationAttentionScope options={options} targets={targets}>
        <GroupCard group={groupRecord} />
        <EventCard event={plannedEvent} />
        <EventTableCard table={plannedTable} />
      </NotificationAttentionScope>
    </QueryClientProvider>,
  );
  for (const [name, count] of [
    [`Open group: ${groupRecord.name}`, 4],
    [`Open event: ${plannedEvent.name}`, 3],
    [`Open table: ${plannedTable.name}`, 2],
  ] as const) {
    const link = screen.getByRole("link", { name }),
      badge = within(link.closest(".card") as HTMLElement).getByRole("img", {
        name: "Unread updates",
      });
    expect(badge.textContent).toBe("");
    expect(
      client
        .getQueryData<NotificationAttentionSnapshot>(
          notificationAttentionQuery(options, targets).queryKey,
        )
        ?.targets.some((row) => row.count === count),
    ).toBe(true);
    expect(link.closest(".card")?.contains(badge)).toBe(true);
    expect(badge.previousElementSibling?.textContent).toBe(name.split(": ")[1]);
    expect(badge.className).toContain("badge--danger");
    expect(badge.style.width).toBe("8px");
    expect(badge.style.position).not.toBe("absolute");
  }
  expect(screen.queryByRole("button", { name: /Accept invitation|Decline invitation/ })).toBeNull();
});
it("retains Group information and actual Members-tab attention on entry, never Events ancestry", async () => {
  const client = setup();
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), groupRecord);
  const members = { kind: "item", id: notificationItemId(groupRecord.id, "members") } as const;
  const memberRow: NotificationAttentionCount = {
    target: members,
    count: 1,
    direct: 1,
    events: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  };
  const source = counts();
  source.targets.push(memberRow);
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH")
      return Response.json({ error: "Unexpected entry read" }, { status: 500 });
    if (url.includes("/notifications/attention")) {
      const requested = JSON.parse(
        new URL(url).searchParams.get("targets") ?? "[]",
      ) as NotificationAttentionTarget[];
      return Response.json({
        ...source,
        targets: requested.map(
          (target) =>
            source.targets.find(
              (row) => row.target.kind === target.kind && row.target.id === target.id,
            ) ?? {
              target,
              count: 0,
              direct: 0,
              events: 0,
              sections: { connections: 0, requests: 0, search: 0 },
            },
        ),
      });
    }
    if (url.includes("/api/events?"))
      return Response.json({ items: [plannedEvent], nextCursor: null });
    return Response.json(groupRecord);
  });
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <QueryClientProvider client={client}>
      <GroupDetail groupId={groupRecord.id} />
    </QueryClientProvider>,
  );
  await screen.findByRole("tab", { name: /Details/ });
  expect(
    within(screen.getByRole("tab", { name: /Details/ })).getByRole("img", {
      name: "Needs attention",
    }),
  ).toBeTruthy();
  expect(within(screen.getByRole("tab", { name: /Events/ })).queryByRole("img")).toBeNull();
  await waitFor(() =>
    expect(
      within(screen.getByRole("tab", { name: /Members/ })).getByRole("img", {
        name: "Needs attention",
      }),
    ).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("tab", { name: /Events/ }));
  await screen.findByRole("link", { name: `Open event: ${plannedEvent.name}` });
  expect(within(screen.getByRole("tab", { name: /Events/ })).queryByRole("img")).toBeNull();
  expect(
    within(screen.getByRole("tab", { name: /Members/ })).getByRole("img", {
      name: "Needs attention",
    }),
  ).toBeTruthy();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  expect(client.getQueryData(groupRecordKeys.detail(options, groupRecord.id))).toEqual(groupRecord);
});
it("opens canonical cards without acknowledging their items or accepting an invitation", async () => {
  const client = setup();
  const held: Array<(value: Response) => void> = [];
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? new Promise<Response>((resolve) => held.push(resolve))
      : Response.json(counts()),
  );
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <QueryClientProvider client={client}>
      <NotificationAttentionScope options={options} targets={targets}>
        <GroupCard group={groupRecord} />
        <EventCard event={plannedEvent} />
        <EventTableCard table={plannedTable} />
      </NotificationAttentionScope>
    </QueryClientProvider>,
  );
  for (const name of [
    `Open table: ${plannedTable.name}`,
    `Open event: ${plannedEvent.name}`,
    `Open group: ${groupRecord.name}`,
  ])
    fireEvent.click(screen.getByRole("link", { name }));
  expect(held).toHaveLength(0);
  expect(
    fetcher.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init?.body)).target.kind)
      .sort(),
  ).toEqual([]);
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  await act(async () => {
    for (const release of held) release(Response.json({ error: "Denied" }, { status: 409 }));
  });
});
it("leaves item markers and bell unread until the Alert supplies a source read, never through item controls", async () => {
  const client = setup();
  const date = {
    kind: "item",
    id: notificationItemId(plannedEvent.id, "date", groupRecord.id),
  } as const;
  const location = {
    kind: "item",
    id: notificationItemId(plannedEvent.id, "location", groupRecord.id),
  } as const;
  let source: NotificationAttentionSnapshot = {
    ...counts(),
    unreadCount: 1,
    targets: [date, location].map((target) => ({
      target,
      count: 1,
      direct: 1,
      events: 0,
      sections: { connections: 0, requests: 0, search: 0 },
      readEffect: {
        unread: 0,
        summary: {
          tables: 0,
          events: 0,
          groups: 0,
          contacts: 0,
          sections: { connections: 0, requests: 0, search: 0 },
        },
        targets: [{ target, count: 1, direct: 1, events: 0 }],
      },
    })),
  };
  client.setQueryData(notificationAttentionQuery(options, [date, location]).queryKey, source);
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(source));
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <QueryClientProvider client={client}>
      <NotificationAttentionScope options={options} targets={[date, location]}>
        <NotificationItem itemId={date.id}>
          <p>Changed date</p>
        </NotificationItem>
        <ul>
          <GroupedRow>
            <p>Changed location</p>
            <NotificationItem itemId={location.id} />
          </GroupedRow>
        </ul>
      </NotificationAttentionScope>
    </QueryClientProvider>,
  );
  expect(screen.getAllByRole("img", { name: "Unread updates" })).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
  const locationRow = screen.getByRole("listitem");
  expect(within(locationRow).getByRole("img", { name: "Unread updates" }).closest("li")).toBe(
    locationRow,
  );
  expect(locationRow.querySelector("[data-slot=badge]")).not.toBeNull();
  fireEvent.click(screen.getAllByRole("img", { name: "Unread updates" })[0]);
  expect(screen.getAllByRole("img", { name: "Unread updates" })).toHaveLength(2);
  expect(
    client.getQueryData<NotificationAttentionSnapshot>(
      notificationAttentionQuery(options, [date, location]).queryKey,
    )?.unreadCount,
  ).toBe(1);
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  source = {
    ...source,
    targets: source.targets.map((row) =>
      row.target.id === date.id ? { ...row, count: 0, direct: 0 } : row,
    ),
  };
  await act(async () => {
    const queryKey = notificationAttentionQuery(options, [date, location]).queryKey;
    await client.cancelQueries({ queryKey });
    client.setQueryData(queryKey, source);
  });
  await waitFor(() =>
    expect(screen.getAllByRole("img", { name: "Unread updates" })).toHaveLength(1),
  );
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});
it("does not mark notification attention when reopening a local failed creation", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        id: "optimistic:draft",
        optimistic: { draftId: "draft", phase: "failed" },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("link"));
  expect(screen.getByRole("link").getAttribute("href")).toBe("/events/new?draftId=draft");
});
it("never inherits attention from a nested scope belonging to another actor", async () => {
  const client = setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(counts())),
  );
  renderWithI18n(
    <QueryClientProvider client={client}>
      <NotificationAttentionProvider options={options} targets={targets}>
        <GroupCard group={groupRecord} />
        <NotificationAttentionProvider
          options={{ ...options, userId: "other", enabled: false }}
          targets={[]}
        >
          <GroupCard group={{ ...groupRecord, name: "Foreign row" }} />
        </NotificationAttentionProvider>
      </NotificationAttentionProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("img", { name: "Unread updates" });
  const foreign = screen.getByRole("link", { name: "Open group: Foreign row" });
  expect(within(foreign).queryByRole("img", { name: "Unread updates" })).toBeNull();
});
