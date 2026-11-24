import type {
  NotificationAttentionTarget,
  PlannedEventResponse,
} from "@board-game-organizer/schemas";
import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventDetail } from "../EventDetail";

const options = {
  apiUrl: "https://event-voting-source.test",
  userId: "viewer",
  getToken: async () => "voting-fixture-token",
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
afterEach(() => vi.unstubAllGlobals());

it("shows the names behind mixed-category votes only while the viewer has accepted participation", async () => {
  const dateId = plannedEvent.dates[0].id;
  const sectionCounts = { connections: 0, requests: 0, search: 0 };
  const current: PlannedEventResponse = {
    ...plannedEvent,
    adminUserId: "manager",
    groupType: "PRIVATE",
    role: "member",
    canEdit: false,
    canManage: false,
    canVote: true,
    dateVoteRequired: true,
    locations: [
      ...plannedEvent.locations,
      {
        ...plannedEvent.locations[0],
        id: "55555555-5555-4555-8555-555555555555",
        name: "Alternative venue",
      },
    ],
    myRegistrations: [seat("viewer")],
    voteVoters: {
      dates: {
        [dateId]: {
          YES: [
            {
              userId: "participant",
              username: "voter",
              name: "Private full name",
              avatarUrl: null,
            },
          ],
          NO: [],
          IF_NEEDED: [],
        },
      },
      locations: {},
    },
  };
  const requests = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    expect(url.origin).toBe(options.apiUrl);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer voting-fixture-token");
    expect(init?.method ?? "GET").toBe("GET");
    if (url.pathname === `/api/events/${eventId}`) return Response.json(current);
    if (url.pathname === "/api/notifications/attention") {
      const targets = JSON.parse(
        url.searchParams.get("targets") ?? "[]",
      ) as NotificationAttentionTarget[];
      return Response.json({
        asOf: plannedEvent.createdAt,
        unreadCount: 0,
        summary: { tables: 0, groups: 0, events: 0, contacts: 0, sections: sectionCounts },
        targets: targets.map((target) => ({
          target,
          count: 0,
          direct: 0,
          events: 0,
          sections: sectionCounts,
        })),
      });
    }
    if (url.pathname === "/api/notifications/changes") {
      return Response.json({
        asOf: plannedEvent.createdAt,
        changes: [],
        nextCursor: null,
        tabCounts: { members: 0, participants: 0, tables: 0, details: 0 },
      });
    }
    throw new Error(`Unexpected Event vote fixture endpoint: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", requests);
  const existing = { defaultOptions: { queries: { retry: false }, mutations: { retry: false } } };
  const client = new QueryClient(existing);
  try {
    renderWithI18n(
      <QueryClientProvider client={client}>
        <EventDetail eventId={eventId} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Dates and times" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Event details help" }));
    const guide = within(await screen.findByRole("dialog"));
    expect(guide.getByText(/Vote again on the changed option/)).toBeVisible();
    expect(guide.getByText(/For a category with several options/)).toBeVisible();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const date = "2030-06-03 20:00";
    const summary = screen.getByRole("button", { name: `Vote summary: ${date}` });
    fireEvent.click(summary);
    const results = within(screen.getByRole("list", { name: `Votes: ${date}` }));
    fireEvent.click(results.getByRole("button", { name: `${date}: Show votes — Yes` }));
    const sheet = within(await screen.findByRole("dialog", { name: "Votes" }));
    expect(sheet.getByText("@voter")).toBeVisible();
    expect(sheet.queryByText("Private full name")).toBeNull();
    fireEvent.click(sheet.getByRole("button", { name: "Close" }));

    act(() =>
      client.setQueryData(eventRecordKeys.detail(options, eventId), {
        ...current,
        canVote: false,
        myRegistrations: [seat("viewer")].map((entry) => ({ ...entry, status: "PENDING" })),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: `Vote summary: ${date}` })).toBeNull(),
    );
    expect(screen.queryByRole("list", { name: `Votes: ${date}` })).toBeNull();
    expect(screen.queryByText("@voter")).toBeNull();
  } finally {
    client.clear();
  }
});
