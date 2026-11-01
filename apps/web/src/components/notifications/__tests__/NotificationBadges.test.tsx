import type {
  NotificationAttentionCount,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
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
it("renders no zero/unknown badge, caps visible count at99+ and exposes full accessible count", () => {
  const view = renderWithI18n(
    <>
      <NotificationCountBadge count={0} />
      <NotificationCountBadge />
      <NotificationCountBadge count={130} />
    </>,
  );
  expect(view.container.querySelectorAll("[data-slot=badge]")).toHaveLength(1);
  expect(screen.getByRole("img", { name: "Notifications: 130" }).textContent).toBe("99+");
  expect(screen.queryByText("0")).toBeNull();
});
it("places equal red counts outside each card's clipping frame at top-right, apart from entity status", async () => {
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
      badge = await screen.findByRole("img", { name: `Notifications: ${count}` });
    expect(badge.parentElement).toBe(link.parentElement?.parentElement);
    expect(link.parentElement?.contains(badge)).toBe(false);
    expect(badge.style.top).toBe("-8px");
    expect(badge.style.right).toBe("-8px");
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
        targets: source.targets.filter((row) =>
          requested.some((value) => value.kind === row.target.kind && value.id === row.target.id),
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
      name: "Notifications: 3",
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
      name: "Notifications: 3",
    }),
  ).toBeTruthy();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  expect(
    JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body))
      .target,
  ).toEqual(group);
  expect(client.getQueryData(groupRecordKeys.detail(options, groupRecord.id))).toEqual(groupRecord);
});
it("opens each canonical card through its direct read only, without accepting an invitation", async () => {
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
  await waitFor(() => expect(held).toHaveLength(3));
  expect(
    fetcher.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init?.body)).target.kind)
      .sort(),
  ).toEqual(["event", "group", "table"]);
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  await act(async () => {
    for (const release of held) release(Response.json({ error: "Denied" }, { status: 409 }));
  });
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
  await screen.findByRole("img", { name: "Notifications: 4" });
  const foreign = screen.getByRole("link", { name: "Open group: Foreign row" });
  expect(foreign.parentElement?.parentElement?.querySelector("[data-slot=badge]")).toBeNull();
});
