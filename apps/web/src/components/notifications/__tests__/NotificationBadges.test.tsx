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
it("places 8px red dots outside every card's clipping frame, including personal Tables", async () => {
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
      badge = within(link.parentElement?.parentElement as HTMLElement).getByRole("img", {
        name: "Needs attention",
      });
    expect(badge.textContent).toBe("");
    expect(
      client
        .getQueryData<NotificationAttentionSnapshot>(
          notificationAttentionQuery(options, targets).queryKey,
        )
        ?.targets.some((row) => row.count === count),
    ).toBe(true);
    expect(badge.parentElement).toBe(link.parentElement?.parentElement);
    expect(link.parentElement?.contains(badge)).toBe(false);
    expect(badge.style.top).toBe("-4px");
    expect(badge.style.right).toBe("-4px");
    expect(badge.style.width).toBe("8px");
    expect(badge.className).toContain("badge--danger");
    expect(badge.className).toContain("badge--sm");
    expect(badge.style.pointerEvents).toBe("none");
  }
  expect(screen.queryByRole("button", { name: /Accept invitation|Decline invitation/ })).toBeNull();
});
it("marks direct Group attention on actual detail entry, retaining Events tab and child badges", async () => {
  const client = setup();
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), groupRecord);
  let source = counts(),
    release!: (value: Response) => void;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH")
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
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
  await waitFor(() => expect(release).toBeTypeOf("function"));
  expect(
    within(screen.getByRole("tab", { name: /Events/ })).getByRole("img", {
      name: "Needs attention",
    }),
  ).toBeTruthy();
  source = counts();
  source.unreadCount = 3;
  source.summary.groups = 3;
  source.targets[2].count = 3;
  source.targets[2].direct = 0;
  await act(async () => release(Response.json({ updated: 1, snapshot: source })));
  fireEvent.click(screen.getByRole("tab", { name: /Events/ }));
  await screen.findByRole("link", { name: `Open event: ${plannedEvent.name}` });
  expect(
    within(screen.getByRole("tab", { name: /Events/ })).getByRole("img", {
      name: "Needs attention",
    }),
  ).toBeTruthy();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  expect(
    JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body))
      .target,
  ).toEqual(group);
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
it("acknowledges only an explicit readonly item, retaining the other point and the bell until completion", async () => {
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
  let release!: (response: Response) => void;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json(source),
  );
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <QueryClientProvider client={client}>
      <NotificationAttentionScope options={options} targets={[date, location]}>
        <NotificationItem itemId={date.id} readOnly>
          <p>Changed date</p>
        </NotificationItem>
        <NotificationItem itemId={location.id}>
          <p>Changed location</p>
        </NotificationItem>
      </NotificationAttentionScope>
    </QueryClientProvider>,
  );
  expect(screen.getAllByRole("img", { name: "Needs attention" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
  await waitFor(() => expect(release).toBeTypeOf("function"));
  expect(screen.getAllByRole("img", { name: "Needs attention" })).toHaveLength(1);
  expect(
    client.getQueryData<NotificationAttentionSnapshot>(
      notificationAttentionQuery(options, [date, location]).queryKey,
    )?.unreadCount,
  ).toBe(1);
  expect(
    JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
  ).toEqual({ target: date, through: source.asOf });
  source = {
    ...source,
    targets: source.targets.map((row) =>
      row.target.id === date.id ? { ...row, count: 0, direct: 0 } : row,
    ),
  };
  await act(async () => release(Response.json({ updated: 1, snapshot: source })));
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
  await screen.findByRole("img", { name: "Needs attention" });
  const foreign = screen.getByRole("link", { name: "Open group: Foreign row" });
  expect(foreign.parentElement?.parentElement?.querySelector("[data-slot=badge]")).toBeNull();
});
