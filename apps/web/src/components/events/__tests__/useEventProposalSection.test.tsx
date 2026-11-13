import type { EventProposalResponse } from "@board-game-organizer/schemas";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { optionId, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { useEventProposalSection } from "../../../../../../packages/shared/src/events/hooks/useEventProposalSection";

const m = vi.hoisted(() => ({
  q: { items: [] as EventProposalResponse[], hasVerifiedBase: true },
  actions: {
    busy: false,
    decide: vi.fn(),
    propose: vi.fn<(value: unknown, callbacks: { onSettled(): void }) => void>(),
  },
  intents: [] as {
    variables: { payload: EventProposalResponse["payload"]; clientRequestId: string };
  }[],
}));
vi.mock("../../../../../../packages/shared/src/events/hooks/useEventProposals", () => ({
  useEventProposals: () => m.q,
}));
vi.mock("../../../../../../packages/shared/src/events/hooks/useEventProposalActions", () => ({
  useEventProposalActions: () => m.actions,
  useEventProposalIntents: () => m.intents,
}));
const options = { apiUrl: "https://api.test", userId: "actor", getToken: async () => "token" };
const event = {
  ...plannedEvent,
  groupType: "PRIVATE" as const,
  canManage: true,
  allowParticipantDates: true,
  allowParticipantLocations: true,
};
const table = { ...plannedTable, allowParticipantGames: true, canProposeGames: true };
const date: EventProposalResponse = {
  id: optionId,
  eventId: event.id,
  groupId: event.groupId,
  userId: "actor",
  authorName: "Actor",
  clientRequestId: optionId,
  label: "Date proposal",
  payload: { kind: "date", day: "2030-06-04", startTime: "20:00" },
  status: "PENDING",
  version: 1,
  submittedEventVersion: 1,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.q.items = [date];
  m.intents = [];
});

it.each(["location", "game"] as const)(
  "keeps %s submission subject to its own capability",
  (kind) => {
    const participant = {
      ...event,
      canManage: false,
      role: "participant" as const,
      canProposeLocations: true,
    };
    const h = renderHook(
      ({ value }) => useEventProposalSection(options, participant, kind, value),
      {
        initialProps: { value: table },
      },
    );
    expect(h.result.current.canPropose).toBe(true);
    h.rerender({ value: { ...table, canProposeGames: false } });
    expect(h.result.current.canPropose).toBe(kind === "location");
  },
);

it("rejects disabled submission permissions, invalid input, duplicate sends and detached callbacks", () => {
  const participant = {
    ...event,
    canManage: false,
    role: "participant" as const,
    canProposeDates: true,
  };
  const h = renderHook(({ value }) => useEventProposalSection(options, value, "date"), {
    initialProps: { value: participant },
  });
  expect(h.result.current.submitDate("invalid")).toBe(false);
  expect(h.result.current.submitDate("2030-06-05T20:00")).toBe(true);
  expect(h.result.current.submitDate("2030-06-05T20:00")).toBe(false);
  const submit = h.result.current.submitDate;
  const settled = m.actions.propose.mock.calls[0][1].onSettled;
  h.rerender({ value: { ...participant, version: 2 } });
  expect(submit("2030-06-05T20:00")).toBe(false);
  settled();
  expect(h.result.current.submitDate("2030-06-05T20:00")).toBe(true);
  settled(); // A late callback must not clear another owner's in-flight send.
  expect(h.result.current.submitDate("2030-06-05T20:00")).toBe(false);
  h.rerender({ value: { ...participant, canProposeDates: false } });
  expect(h.result.current.canPropose).toBe(false);
  expect(h.result.current.submitDate("2030-06-05T20:00")).toBe(false);
});

it("retains only matching Table intents and reviews a grouped game with its exact revision", () => {
  const game = {
    ...date,
    payload: { kind: "game" as const, tableId: table.id, gameId: 2 },
    groupRevision: "a".repeat(64),
  };
  m.q.items = [game];
  m.intents = [
    { variables: { payload: game.payload, clientRequestId: "matching" } },
    { variables: { payload: { ...game.payload, tableId: "other" }, clientRequestId: "foreign" } },
    { variables: { payload: date.payload, clientRequestId: "date" } },
  ];
  const h = renderHook(({ value }) => useEventProposalSection(options, event, "game", value), {
    initialProps: { value: table },
  });
  expect(h.result.current.intents.map((i) => i.variables.clientRequestId)).toEqual(["matching"]);
  expect(h.result.current.submitDate("2030-06-05T20:00")).toBe(false);
  act(() => h.result.current.open({ ...game, payload: { ...game.payload, tableId: "other" } }));
  expect(h.result.current.decision).toBeNull();
  act(() => h.result.current.open(game));
  h.rerender({ value: { ...table, id: "other" } });
  expect(h.result.current.decision).toBeNull();
  h.rerender({ value: table });
  act(() => h.result.current.open(game));
  expect(h.result.current.validDecision).toBe(true);
  act(() => h.result.current.confirm());
  expect(m.actions.decide).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "accept",
      groupRevision: game.groupRevision,
      game: { tableId: table.id, gameId: 2 },
    }),
  );
  act(() => h.result.current.confirm());
  expect(m.actions.decide).toHaveBeenCalledTimes(1);
});
