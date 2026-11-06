import type { EventParticipantResponse, PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventParticipantsQuery,
  eventRecordKeys,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
// jsdom has no geometry. Browser acceptance owns the real virtualizer.
vi.mock("@heroui/react/rac", async (original) => ({
  ...(await original<typeof import("@heroui/react/rac")>()),
  Virtualizer: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
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
  const key = eventParticipantsQuery(o, eventId).queryKey;
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
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(plannedEvent)),
  );
});
afterEach(() => {
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});
async function choose(action = "Remove from event") {
  fireEvent.click(await screen.findByRole("button", { name: "Manage participant: target-name" }));
  fireEvent.click(await screen.findByRole("button", { name: action }));
}
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
  expect(await screen.findByText("self-name")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Manage participant: self-name" })).toBeNull();
  expect(screen.getByRole("button", { name: "Manage participant: target-name" })).toBeTruthy();
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
    expect(screen.queryByText("target-name")).toBeNull();
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
      await screen.findByText("target-name");
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
it("uses exactly the existing Group ban POST, never a second non-atomic Event-removal request", async () => {
  let finish: ((r: Response) => void) | undefined;
  const grouped = {
    ...plannedEvent,
    version: 1,
    groupId: groupRecord.id,
    groupType: "PRIVATE" as const,
  };
  const fetch = vi.fn((url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(
          Response.json(
            url.includes("/groups/")
              ? groupRecord
              : url.includes("/participants?")
                ? {
                    items: [],
                    eventVersion: 2,
                    groupId: groupRecord.id,
                    status: "PLANNING",
                    nextCursor: null,
                  }
                : grouped,
          ),
        ),
  );
  vi.stubGlobal("fetch", fetch);
  const f = mount([{ ...person, canBanGroup: true }], grouped);
  const historical = [...eventParticipantsQuery(o, "history").queryKey];
  f.client.setQueryData(historical, {
    pages: [{ ...f.data.pages[0], status: "TERMINATED" }],
    pageParams: [""],
  });
  await choose("Ban from group");
  const dialog = await screen.findByRole("dialog", { name: "Ban from group: target-name" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Ban from group" }));
  await waitFor(() => expect(finish).toBeDefined());
  expect(f.client.getQueryData(f.key)).toMatchObject({ pages: [{ items: [] }] });
  expect(f.client.getQueryData(historical)).toMatchObject({
    pages: [{ items: [{ userId: "target" }] }],
  });
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([
    [
      `https://api.test/api/groups/${groupRecord.id}/bans`,
      expect.objectContaining({ body: JSON.stringify({ userId: "target", until: null }) }),
    ],
  ]);
  expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  const reply = finish;
  if (!reply) throw new Error("Missing ban request");
  await act(async () =>
    reply(
      Response.json({
        id: "ban",
        groupId: groupRecord.id,
        userId: "target",
        until: null,
        createdAt: new Date().toISOString(),
      }),
    ),
  );
});
it("does not offer stale manager affordances to ordinary members and shows empty/error paths", async () => {
  const f = mount([person], { ...plannedEvent, canManage: false, role: "member", canEdit: false });
  expect(await screen.findByText("target-name")).toBeTruthy();
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
  expect(screen.queryByText("target-name")).toBeNull();
});
