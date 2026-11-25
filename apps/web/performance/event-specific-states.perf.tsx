import type { EventProposalResponse, PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventDraft, eventRecordKeys } from "@board-game-organizer/shared";
import { useQueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, vi } from "vitest";
import { EventCardIndicators } from "@/components/events/EventCardIndicators";
import { EventPlayerRatingPopover } from "@/components/events/EventPlayerRatingPopover";
import { EventProposalSection } from "@/components/events/EventProposalSection";
import { EventTableInvitationActions } from "@/components/events/EventTableInvitationActions";
import { EventTableSchedulePopover } from "@/components/events/EventTableSchedulePopover";
import { EventWizardSummary } from "@/components/events/EventWizardSummary";
import { enterDateTime, readDateTime } from "@/test-fixtures/dateTime";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { measureWebFeature } from "./featureScenario";

const api = vi.hoisted(() => ({
  apiUrl: "https://event-states-render.test",
  userId: "owner",
  getToken: async () => "fixture-event-state-token",
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

function expectNoRequests() {
  const requests = vi.fn(async () => {
    throw new Error("Unexpected API request from a read-only scenario");
  });
  vi.stubGlobal("fetch", requests);
}

const proposalEvent: PlannedEventResponse = {
  ...plannedEvent,
  groupId: groupRecord.id,
  groupType: "PRIVATE",
  canManage: true,
  allowParticipantDates: true,
};
const proposal: EventProposalResponse = {
  id: "44444444-4444-4444-8444-444444444444",
  eventId: proposalEvent.id,
  groupId: groupRecord.id,
  userId: "proposer",
  authorName: "Proposing Player",
  authorUsername: "proposer",
  clientRequestId: "55555555-5555-4555-8555-555555555555",
  label: "Second date",
  payload: { kind: "date", day: "2030-06-04", startTime: "19:00" },
  status: "PENDING",
  version: 1,
  submittedEventVersion: 1,
  groupRevision: "a".repeat(64),
  createdAt: proposalEvent.createdAt,
  updatedAt: proposalEvent.updatedAt,
};

measureWebFeature(
  "EventProposalSection: disclose a real pending proposal without committing a decision",
  <EventProposalSection event={proposalEvent} kind="date" />,
  async () => {
    const action = await screen.findByRole("button", { name: /^Review proposal:/ });
    await waitFor(() => expect(action).toBeEnabled());
    fireEvent.click(action);
    const proposalView = within(await screen.findByRole("dialog", { name: "Review proposal" }));
    expect(proposalView.getByRole("heading", { name: "Proposed by" })).toBeVisible();
    expect(proposalView.getByText("@proposer")).toBeVisible();
    expect(proposalView.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(proposalView.getByRole("button", { name: "Reject" })).toBeEnabled();
    fireEvent.click(proposalView.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(action).toBeEnabled();
  },
  () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        expect(url.origin).toBe(api.apiUrl);
        expect(init?.method ?? "GET").toBe("GET");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer fixture-event-state-token",
        );
        if (url.pathname === `/api/events/${proposalEvent.id}`) return Response.json(proposalEvent);
        expect(url.pathname).toBe(`/api/events/${proposalEvent.id}/proposals`);
        return Response.json({
          eventId: proposalEvent.id,
          groupId: groupRecord.id,
          eventVersion: proposalEvent.version,
          mode: "review",
          items: [proposal],
          nextCursor: null,
        });
      }),
    );
  },
);

const registration = { ...seat("owner"), status: "PENDING" as const };

function InvitationalTable() {
  const client = useQueryClient();
  useState(() => {
    client.setQueryData(eventRecordKeys.detail(api, plannedEvent.id), plannedEvent);
    client.setQueryData(eventRecordKeys.table(api, plannedEvent.id, plannedTable.id), {
      ...plannedTable,
      canRespond: true,
      myRegistration: registration,
    });
  });
  return <EventTableInvitationActions eventId={plannedEvent.id} registration={registration} />;
}

measureWebFeature(
  "Table invitation actions: review the real join sheet before granting consent",
  <InvitationalTable />,
  async () => {
    const accept = screen.getByRole("button", { name: "Accept invitation" });
    fireEvent.click(accept);
    const dialog = within(await screen.findByRole("dialog", { name: "Review table settings" }));
    expect(dialog.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
  },
  expectNoRequests,
);

measureWebFeature(
  "EventWizardSummary: render verified venue, settings and player choice",
  <EventWizardSummary
    draft={{
      ...eventDraft(plannedEvent),
      name: "Prepared event",
      playerPreference: "BEST",
    }}
    groupName={groupRecord.name}
  />,
  () => {
    expect(screen.getByRole("heading", { name: "Prepared event" })).toBeVisible();
    expect(screen.getByText(groupRecord.name)).toBeVisible();
    expect(screen.getByText("Assisted")).toBeVisible();
    expect(screen.getByText("BGG Best")).toBeVisible();
    expect(screen.getByText(plannedEvent.locations[0].address)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Table list" })).toBeVisible();
  },
);

const confirmedTable = {
  ...plannedTable,
  eventStatus: "CONFIRMED" as const,
  confirmed: { gameId: 1, playerIds: ["owner", "Ada"], startsAt: "2030-06-03T18:00:00Z" },
};

measureWebFeature(
  "Schedule popovers: present the confirmed event and table venue accurately",
  <>
    <EventCardIndicators
      event={{
        ...plannedEvent,
        status: "CONFIRMED",
        confirmed: {
          dateId: plannedEvent.dates[0].id,
          locationId: plannedEvent.locations[0].id,
          at: plannedEvent.updatedAt,
        },
      }}
    />
    <EventTableSchedulePopover table={confirmedTable} kind="locations" />
  </>,
  async () => {
    const event = screen.getByRole("button", { name: "Confirmed" });
    fireEvent.click(event);
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Date and time:")).toBeVisible();
    expect(within(dialog).getByText(plannedEvent.locations[0].address)).toBeVisible();
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Locations: Chess" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(plannedEvent.locations[0].address)).toBeVisible();
  },
);

const result = {
  ...confirmedTable,
  eventStatus: "TERMINATED" as const,
  groupId: groupRecord.id,
  results: {
    entries: [
      { userId: "owner", score: "8", rank: 1 },
      { userId: "Ada", score: "4", rank: 2 },
    ],
    lowerWins: false,
    tieBreaks: [],
    finalizedAt: plannedTable.createdAt,
  },
  ratingChanges: [{ userId: "owner", score: 520, delta: 20, provisional: true }],
  groupRatingChanges: [{ userId: "owner", score: 490, delta: -10, provisional: false }],
};

measureWebFeature(
  "EventPlayerRatingPopover: open historical scope without exposing the other rating",
  <EventPlayerRatingPopover table={result} userId="owner" name="@owner" />,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Global ranking: @owner" }));
    const global = within(await screen.findByRole("dialog", { name: "Global ranking: @owner" }));
    expect(global.getByText("Rating before")).toBeVisible();
    expect(global.getByText("520")).toBeVisible();
    expect(global.getByText("+20")).toBeVisible();
    expect(global.queryByText("490")).toBeNull();
    expect(global.getByRole("img", { name: "Provisional rating" })).toBeVisible();
  },
);

const proposer: PlannedEventResponse = {
  ...proposalEvent,
  adminUserId: "creator",
  role: "participant",
  managementRole: null,
  canManage: false,
  canProposeDates: true,
  myRegistrations: [seat("owner")],
};
measureWebFeature(
  "Inline date proposal: edit the real calendar segments without an implicit submission",
  <EventProposalSection event={proposer} kind="date" />,
  async () => {
    const field = screen.getByRole("group", { name: "Date and time" });
    const add = screen.getByRole("button", { name: "Add date" });
    expect(add).toBeDisabled();
    enterDateTime(field, "2030-06-05T21:00");
    expect(readDateTime(field)).toBe("2030-06-05T21:00");
    expect(add).toBeEnabled();
    expect(await screen.findByText("No proposals")).toBeVisible();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  },
  () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        expect(url.origin).toBe(api.apiUrl);
        expect(init?.method ?? "GET").toBe("GET");
        return Response.json({
          eventId: proposer.id,
          groupId: groupRecord.id,
          eventVersion: proposer.version,
          items: [],
          mode: "mine",
          nextCursor: null,
        });
      }),
    );
  },
);
