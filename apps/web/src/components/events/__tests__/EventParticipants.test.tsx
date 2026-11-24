import type { EventParticipantResponse, PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventParticipantsQuery,
  eventRecordKeys,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { eventId, groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventParticipants } from "../EventParticipants";

const mocks = vi.hoisted(() => ({ feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() } }));
const o = {
  apiUrl: "https://api.test",
  userId: "owner",
  getToken: async () => "fresh",
  feedback: mocks.feedback,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => o }));
const clients: QueryClient[] = [];
const person: EventParticipantResponse = {
  id: "target",
  userId: "target",
  name: "Display name",
  username: "target-name",
  avatarUrl: null,
  position: "WAITING",
  canRemove: true,
  canBanGroup: false,
};
function Surface({ event }: { event: PlannedEventResponse }) {
  const actions = useEventRecordActions(o, event.id);
  return <EventParticipants event={event} actions={actions} />;
}
function mount(
  people = [person],
  event = { ...plannedEvent, version: 1, participantCount: people.length },
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const key = eventParticipantsQuery(
    o,
    eventId,
    event.canManage ? { mode: "review", groupId: event.groupId } : { mode: "member" },
  ).queryKey;
  const data = {
    pages: [
      {
        items: people,
        eventVersion: event.version,
        groupId: event.groupId,
        status: event.status,
        nextCursor: null,
      },
    ],
    pageParams: [""],
  };
  client.setQueryData(key, data);
  client.setQueryData(eventRecordKeys.detail(o, eventId), event);
  const view = renderWithI18n(
    <QueryClientProvider client={client}>
      <Surface event={event} />
    </QueryClientProvider>,
  );
  return { client, key, data, event, ...view };
}
beforeEach(() => {
  installBrowserIntersections();
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(plannedEvent)),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});
async function choose(action = "Remove from event") {
  fireEvent.click(await screen.findByRole("button", { name: "Manage participant: @target-name" }));
  fireEvent.click(await screen.findByRole("button", { name: action }));
}
it.each([
  ["admin", "Admin", "crown", "warning"],
  ["moderator", "Moderator", "shield-check", "accent"],
  [null, "Participant on the waiting list", "list-ordered", "warning"],
  [undefined, "Participant on the waiting list", "list-ordered", "warning"],
] as const)(
  "shows a single @handle, current %s subtitle and semantic avatar overlay without inventing actions",
  async (managementRole, label, icon, color) => {
    mount([{ ...person, username: "@target-name", managementRole, canRemove: false }]);
    const name = await screen.findByText("@target-name");
    expect(screen.queryByText("Display name")).toBeNull();
    expect(screen.getByText(label)).toBeTruthy();
    const badge = screen.getByRole("button", { name: new RegExp(`^${label} ·`) });
    expect(badge.querySelector("[data-slot=chip]")?.className).toContain(`chip--${color}`);
    expect(badge.parentElement?.className).toContain("absolute");
    expect(badge.querySelector(".lucide-plus")).not.toBeNull();
    fireEvent.click(badge);
    expect(await screen.findByText("Roles and participation")).toBeTruthy();
    expect(screen.getAllByText("Accepted participant")).toHaveLength(1);
    expect(badge.querySelector(`svg.lucide-${icon}`)).not.toBeNull();
    expect(name.closest("li")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Manage participant: @target-name" })).toBeNull();
  },
);
it("keeps the known fallback when a username is absent instead of fabricating a handle", async () => {
  mount([{ ...person, username: null, position: "SEATED" }]);
  expect(await screen.findByText("Display name")).toBeTruthy();
  expect(screen.getByText("Accepted participant")).toBeTruthy();
  expect(screen.queryByText("@Display name")).toBeNull();
});
it("never exposes own-row moderation, even if restored flags incorrectly claim it is allowed", async () => {
  mount(
    [
      {
        ...person,
        id: "owner",
        userId: "owner",
        username: "self-name",
        canRemove: true,
        canBanGroup: true,
      },
      person,
    ],
    {
      ...plannedEvent,
      groupId: groupRecord.id,
      groupType: "PRIVATE",
      canManage: true,
      version: 1,
      participantCount: 2,
    },
  );
  expect(await screen.findByText("@self-name")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Manage participant: @self-name" })).toBeNull();
  expect(screen.getByRole("button", { name: "Manage participant: @target-name" })).toBeTruthy();
});
it.each([true, false])(
  "projects Event removal immediately, keeps Group untouched and selectively reconciles receipt/failure: %s",
  async (success) => {
    let finish: ((r: Response) => void) | undefined;
    const fetch = vi.fn((url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(
            Response.json(
              url.includes("/participants?")
                ? {
                    items: success ? [] : [person],
                    eventVersion: success ? 2 : 1,
                    groupId: null,
                    status: "PLANNING",
                    nextCursor: null,
                  }
                : plannedEvent,
            ),
          ),
    );
    vi.stubGlobal("fetch", fetch);
    const f = mount();
    await choose();
    const dialog = await screen.findByRole("dialog", { name: "Remove from event" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from event" }));
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("@target-name")).toBeNull();
    expect(f.client.getQueryData(f.key)).toMatchObject({ pages: [{ items: [] }] });
    expect(mocks.feedback.onOptimisticUpdate).toHaveBeenCalledWith("remove_event_player");
    expect(fetch).toHaveBeenCalledWith(
      `https://api.test/api/events/${eventId}/participants/target`,
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ version: 1 }) }),
    );
    const reply = finish;
    if (!reply) throw new Error("Missing held request");
    await act(async () =>
      reply(
        success
          ? Response.json({ ...f.event, version: 2, participantCount: 0 })
          : Response.json({ error: "EVENT_CHANGED" }, { status: 409 }),
      ),
    );
    if (success)
      await waitFor(() =>
        expect(f.client.getQueryData(eventRecordKeys.detail(o, eventId))).toMatchObject({
          version: 2,
        }),
      );
    else {
      await screen.findByText("@target-name");
      expect(mocks.feedback.onError).toHaveBeenCalled();
    }
    expect(
      fetch.mock.calls.some(([url, init]) => url.includes("/groups/") && init?.method === "DELETE"),
    ).toBe(false);
  },
);
it("cancels without writes, fences a changed version and leaves cancellation available", async () => {
  const fetch = vi.fn(async () => Response.json(plannedEvent));
  vi.stubGlobal("fetch", fetch);
  const f = mount();
  await choose();
  fireEvent.click(
    within(await screen.findByRole("dialog", { name: "Remove from event" })).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(fetch).not.toHaveBeenCalled();
  await choose();
  f.rerender(
    <QueryClientProvider client={f.client}>
      <Surface event={{ ...f.event, version: 2 }} />
    </QueryClientProvider>,
  );
  await screen.findByText("Event details changed. Close and reopen this action.");
  expect(
    within(screen.getByRole("dialog")).queryByRole("button", { name: "Remove from event" }),
  ).toBeNull();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("offers Event removal only, never a Group ban or shortcut even when old cached flags claim it is allowed", async () => {
  const grouped = {
    ...plannedEvent,
    version: 1,
    groupId: groupRecord.id,
    groupType: "PRIVATE" as const,
  };
  const fetch = vi.fn(async () => Response.json(grouped));
  vi.stubGlobal("fetch", fetch);
  const f = mount([{ ...person, canBanGroup: true }], grouped);
  const historical = [...eventParticipantsQuery(o, "history").queryKey];
  f.client.setQueryData(historical, {
    pages: [{ ...f.data.pages[0], status: "TERMINATED" }],
    pageParams: [""],
  });
  fireEvent.click(await screen.findByRole("button", { name: "Manage participant: @target-name" }));
  expect(screen.queryByRole("button", { name: "Ban from group" })).toBeNull();
  expect(screen.queryByRole("link", { name: /Ban/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove from event" }));
  const dialog = await screen.findByRole("dialog", { name: "Remove from event" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(f.client.getQueryData(historical)).toMatchObject({
    pages: [{ items: [{ userId: "target" }] }],
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("does not offer stale manager affordances to ordinary members and shows empty/error paths", async () => {
  const f = mount([person], { ...plannedEvent, canManage: false, role: "member", canEdit: false });
  expect(await screen.findByText("@target-name")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Manage participant/ })).toBeNull();
  await act(async () =>
    f.client.setQueryData(f.key, { ...f.data, pages: [{ ...f.data.pages[0], items: [] }] }),
  );
  await screen.findByText("No participants yet");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "Forbidden" }, { status: 403 })),
  );
  await act(async () => {
    await f.client.refetchQueries({ queryKey: f.key });
  });
  await screen.findByText("Could not load participants");
  expect(screen.queryByText("@target-name")).toBeNull();
});

it("keeps member rows restricted after an unavailable page and reloads participants only on explicit retry", async () => {
  const f = mount([person], {
    ...plannedEvent,
    canManage: false,
    role: "member",
    canEdit: false,
  });
  let unavailable = true;
  const read = vi.fn(async (input: string, init?: RequestInit) => {
    expect(new URL(input).pathname).toBe(`/api/events/${eventId}/participants`);
    expect(init?.method ?? "GET").toBe("GET");
    return unavailable
      ? Response.json({ error: "UNAVAILABLE" }, { status: 503 })
      : Response.json({
          ...f.data.pages[0],
          items: [{ ...person, name: null, username: null }],
        });
  });
  vi.stubGlobal("fetch", read);
  await act(async () => {
    await f.client.refetchQueries({ queryKey: f.key });
  });
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("Could not load participants");
  expect(screen.queryByText("No participants yet")).toBeNull();
  expect(screen.queryByRole("button", { name: /Manage participant/ })).toBeNull();
  const failedReadCount = read.mock.calls.length;
  expect(failedReadCount).toBeGreaterThan(0);
  unavailable = false;
  fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Username unavailable")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(read.mock.calls.length).toBeGreaterThan(failedReadCount);
});

it("preserves first-page participants during a pending cursor and recovers an unsuccessful next page", async () => {
  const cursor = "checkpoint";
  const reads: (string | null)[] = [];
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending participant page");
  };
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let failed = false;
  const view = mount();
  const second = {
    ...person,
    id: "after-cursor",
    userId: "after-cursor",
    username: "after-cursor",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (!url.pathname.endsWith("/participants")) return Response.json(view.event);
      const next = url.searchParams.get("cursor");
      reads.push(next);
      if (next === cursor && reads.length === 1) return pending;
      if (next === cursor && failed)
        return Response.json({ error: "Participant page unavailable" }, { status: 503 });
      return Response.json({
        items: next === cursor ? [second] : [person],
        eventVersion: view.event.version,
        groupId: view.event.groupId,
        status: view.event.status,
        nextCursor: next === cursor ? null : cursor,
      });
    }),
  );
  await act(() =>
    view.client.setQueryData(view.key, {
      ...view.data,
      pages: [{ ...view.data.pages[0], nextCursor: cursor }],
    }),
  );
  const loadMore = await screen.findByRole("button", { name: "Load more" });
  expect(loadMore).toBeEnabled();
  fireEvent.click(loadMore);
  await waitFor(() => expect(loadMore).toBeDisabled());
  expect(screen.getByText("@target-name")).toBeVisible();
  failed = true;
  await act(() =>
    finish(Response.json({ error: "Participant page unavailable" }, { status: 503 })),
  );
  const retry = await screen.findByRole("button", { name: "Try again" }, { timeout: 3500 });
  expect(screen.getByText("@target-name")).toBeVisible();
  expect(loadMore).toBeDisabled();
  expect(screen.queryByText("No participants yet")).toBeNull();
  failed = false;
  fireEvent.click(retry);
  await waitFor(() => expect(loadMore).toBeEnabled());
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(loadMore);
  expect(await screen.findByText("@after-cursor")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(reads).toEqual([cursor, cursor, null, cursor]);
});
