import {
  type GroupMembership,
  type NotificationAttentionSnapshot,
  notificationItemId,
} from "@board-game-organizer/schemas";
import {
  emptyAttentionSummary,
  eventRecordKeys,
  groupRecordKeys,
  notificationAttentionQuery,
  useEventRecordActions,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";

const options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
  vi.unstubAllGlobals();
});
it.each([
  ["group", true],
  ["group", false],
  ["table", true],
  ["table", false],
] as const)(
  "coordinates %s invitation source attention before transport, saved=%s",
  async (kind, saved) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    clients.push(client);
    const registration = { ...seat("owner"), status: "PENDING" as const };
    const membership: GroupMembership = {
      id: registration.id,
      groupId: groupRecord.id,
      userId: "owner",
      kind: "INVITATION",
      status: "PENDING",
      version: 1,
      createdAt: plannedEvent.createdAt,
      updatedAt: plannedEvent.createdAt,
    };
    const group = {
      ...groupRecord,
      role: "invited" as const,
      myMembership: membership,
      adminUserId: "other",
      canEdit: false,
    };
    const table = { ...plannedTable, myRegistration: registration, canRespond: true };
    client.setQueryData(groupRecordKeys.detail(options, group.id), group);
    client.setQueryData(eventRecordKeys.detail(options, plannedEvent.id), plannedEvent);
    client.setQueryData(eventRecordKeys.table(options, plannedEvent.id, table.id), table);
    const target = {
      kind: "item",
      id: notificationItemId(kind === "group" ? group.id : table.id, "invitation", undefined, kind),
    } as const;
    const container = { kind, id: kind === "group" ? group.id : table.id };
    const unrelated = {
      kind: kind === "group" ? "table" : "group",
      id: kind === "group" ? table.id : group.id,
    } as const;
    const summary = { ...emptyAttentionSummary(), groups: 1, tables: 1, events: 1 };
    const snapshot: NotificationAttentionSnapshot = {
      asOf: "2027-01-01T00:00:00.000Z",
      unreadCount: 3,
      summary,
      targets: [target, container, unrelated].map((value) => ({
        target: value,
        count: 1,
        direct: 1,
        events: 0,
        sections: summary.sections,
        ...(value === target
          ? {
              readEffect: {
                unread: 1,
                summary: {
                  ...emptyAttentionSummary(),
                  [kind === "group" ? "groups" : "tables"]: 1,
                },
                targets: [target, container].map((target) => ({
                  target,
                  count: 1,
                  direct: target.kind === "item" ? 1 : 0,
                  events: 0,
                })),
              },
            }
          : {}),
      })),
    };
    const key = notificationAttentionQuery(
      options,
      snapshot.targets.map((row) => row.target),
    ).queryKey;
    client.setQueryData(key, snapshot);
    const foreign = [...key];
    foreign[2] = "another-owner";
    client.setQueryData(foreign, snapshot);
    let release!: (value: Response) => void,
      ready = false;
    const pending: Array<{ url: string; resolve: (value: Response) => void }> = [];
    const savedGroup = {
      ...group,
      role: "accepted",
      myMembership: { ...membership, status: "ACCEPTED", version: 2 },
      memberCount: group.memberCount + 1,
    };
    const savedTable = {
      ...table,
      myRegistration: { ...registration, status: "ACCEPTED", version: 2 },
      canRespond: false,
      canLeave: true,
    };
    const metadata = (url: string) =>
      Response.json(
        kind === "group"
          ? savedGroup
          : url.includes("/tables/")
            ? savedTable
            : { ...plannedEvent, version: plannedEvent.version + 1 },
      );
    const fetcher = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : ready
          ? metadata(url)
          : new Promise<Response>((resolve) => pending.push({ url, resolve })),
    );
    vi.stubGlobal("fetch", fetcher);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () => ({
        group: useGroupRecordActions(options, group.id),
        table: useEventRecordActions(options, plannedEvent.id),
      }),
      { wrapper },
    );
    act(() => {
      if (kind === "group")
        hook.result.current.group.membership.mutate({
          id: group.id,
          userId: "owner",
          input: { action: "accept", version: 1 },
        });
      else
        hook.result.current.table.respond.mutate({
          tableId: table.id,
          registrationId: registration.id,
          input: {
            action: "accept",
            version: 1,
            participation: { version: plannedEvent.version, gameVotes: { "1": "YES" } },
          },
        });
    });
    await waitFor(() => expect(release).toBeTypeOf("function"));
    expect(
      client.getQueryData<NotificationAttentionSnapshot>(key)?.targets.map((row) => row.count),
    ).toEqual([0, 0, 1]);
    expect(client.getQueryData<NotificationAttentionSnapshot>(key)?.unreadCount).toBe(2);
    expect(client.getQueryData(foreign)).toEqual(snapshot);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).attentionThrough).toBe(snapshot.asOf);
    const { position: _position, ...raw } = registration;
    await act(async () =>
      release(
        saved
          ? Response.json(
              kind === "group"
                ? savedGroup.myMembership
                : {
                    ...raw,
                    status: "ACCEPTED",
                    version: 2,
                    eventVersion: plannedEvent.version + 1,
                  },
            )
          : Response.json({ error: "Denied" }, { status: 409 }),
      ),
    );
    if (!saved) {
      await waitFor(() =>
        expect(
          kind === "group"
            ? hook.result.current.group.membership.isPending
            : hook.result.current.table.respond.isPending,
        ).toBe(false),
      );
      expect(
        client.getQueryData<NotificationAttentionSnapshot>(key)?.targets.map((row) => row.count),
      ).toEqual([1, 1, 1]);
      expect(client.getQueryData<NotificationAttentionSnapshot>(key)?.unreadCount).toBe(3);
      expect(client.getQueryData(foreign)).toEqual(snapshot);
      expect(fetcher.mock.calls).toHaveLength(1);
      return;
    }
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    expect(
      client.getQueryData<NotificationAttentionSnapshot>(key)?.targets.map((row) => row.count),
    ).toEqual([0, 0, 1]);
    await act(async () => {
      ready = true;
      for (const item of pending) item.resolve(metadata(item.url));
    });
    await waitFor(() =>
      expect(
        kind === "group"
          ? hook.result.current.group.membership.isPending
          : hook.result.current.table.respond.isPending,
      ).toBe(false),
    );
    expect(client.getQueryData<NotificationAttentionSnapshot>(key)?.unreadCount).toBe(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  },
);
