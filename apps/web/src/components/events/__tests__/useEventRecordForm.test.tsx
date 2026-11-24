import { MAX_EVENT_OPTIONS, type PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  type EventRecordDraft,
  eventDraft,
  groupRecordKeys,
  recordTablesQuery,
  tableDraft,
  useEventRecordForm,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it } from "vitest";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";

const options = {
  apiUrl: "https://event-draft.test",
  userId: "owner",
  getToken: async () => null,
  enabled: false,
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

it("keeps the standalone draft private and moves public tables only with a valid start date", async () => {
  const { client, wrapper } = setup();
  const publicGroup = { ...groupRecord, type: "PUBLIC" as const };
  client.setQueryData(groupRecordKeys.detail(options, publicGroup.id), publicGroup);
  const { result } = renderHook(() => useEventRecordForm(options, undefined), { wrapper });
  act(() => result.current.patch({ visibility: "PUBLIC" }));
  expect(result.current.draft.visibility).toBe("PRIVATE");
  act(() => result.current.selectGroup(publicGroup.id, publicGroup.type));
  await waitFor(() => expect(result.current.draft.dates).toHaveLength(1));
  expect(result.current.publicGroup).toBe(true);
  expect(result.current.flexibleSchedule).toBe(false);
  act(() =>
    result.current.patch({
      visibility: "PUBLIC",
      endsWall: "2030-06-01T18:00",
      cutoffWall: "2030-06-04T12:00",
    }),
  );
  let tableKey: string | undefined;
  act(() => {
    tableKey = result.current.addTable();
  });
  const key = tableKey;
  if (!key) throw new Error("Expected a table draft");
  act(() => result.current.patchTable(key, { startsWall: "2030-06-01T19:30" }));
  const draftBeforeInvalid = result.current.draft;
  act(() => result.current.setStartDate("2030-06-10"));
  expect(result.current.draft).toBe(draftBeforeInvalid);
  act(() => result.current.setStartDate("2030-06-03T20:00"));
  expect(result.current.draft).toMatchObject({
    visibility: "PUBLIC",
    dates: [{ day: "2030-06-03", startTime: "20:00" }],
    endsWall: "",
    cutoffWall: "",
    tables: [{ key, startsWall: "2030-06-03T19:30" }],
  });
  act(() => {
    result.current.addDate("2030-06-05T20:00");
    result.current.patch({ endsWall: "2030-06-03T23:00", cutoffWall: "2030-06-02T10:00" });
    result.current.setStartDate("2030-06-04T19:00");
  });
  expect(result.current.draft).toMatchObject({
    dates: [{ day: "2030-06-04" }],
    endsWall: "2030-06-04T23:00",
    cutoffWall: "2030-06-02T10:00",
  });
});

it("repairs the required fallback when a saved public draft only has the event day", async () => {
  const { client, wrapper } = setup();
  const publicGroup = { ...groupRecord, type: "PUBLIC" as const };
  client.setQueryData(groupRecordKeys.detail(options, publicGroup.id), publicGroup);
  const recovered = {
    ...eventDraft(undefined, publicGroup.id),
    startTime: "",
    dates: [{ ...plannedEvent.dates[0], startTime: undefined }],
  };
  const { result } = renderHook(
    () => useEventRecordForm(options, undefined, undefined, recovered),
    {
      wrapper,
    },
  );
  await waitFor(() => expect(result.current.publicGroup).toBe(true));
  act(() => result.current.setStartDate("2030-06-03T20:30"));
  expect(result.current.draft.startTime).toBe("20:30");
  expect(result.current.draft.dates).toEqual([
    expect.objectContaining({ day: "2030-06-03", startTime: "20:30" }),
  ]);
});

it("restores missing table order from the authoritative page without restoring a removed row", async () => {
  const { client, wrapper } = setup();
  const event = { ...plannedEvent, groupId: groupRecord.id, groupType: "PRIVATE" as const };
  const restored: EventRecordDraft = {
    ...eventDraft(event),
    tables: [{ ...tableDraft(plannedTable, event.timeZone), order: undefined }],
  };
  const another = { ...plannedTable, id: "77777777-7777-4777-8777-777777777777", order: 5 };
  const cacheKey = recordTablesQuery(options, event.id).queryKey;
  client.setQueryData(cacheKey, {
    pages: [{ items: [{ ...plannedTable, order: 4 }, another], nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), groupRecord);
  const { result, rerender } = renderHook(
    ({ snapshot }: { snapshot: PlannedEventResponse }) =>
      useEventRecordForm(options, snapshot, undefined, restored),
    { initialProps: { snapshot: event }, wrapper },
  );
  expect(result.current.groupLocked).toBe(true);
  expect(result.current.visibilityLocked).toBe(true);
  await waitFor(() =>
    expect(result.current.draft.tables.map(({ order }) => order)).toEqual([4, 5]),
  );
  act(() => {
    result.current.selectGroup(null, null);
    result.current.patch({ groupId: null, visibility: "PUBLIC" });
    result.current.removeTable(plannedTable.id);
    result.current.removeTable("already-removed");
    client.setQueryData(cacheKey, {
      pages: [{ items: [another, plannedTable], nextCursor: null }],
      pageParams: [""],
    });
  });
  expect(result.current.draft.groupId).toBe(groupRecord.id);
  expect(result.current.draft.visibility).toBe("PRIVATE");
  expect(result.current.draft.tables.map(({ id }) => id)).toEqual([another.id]);
  expect(result.current.draft.removedTableIds).toEqual([plannedTable.id]);
  rerender({ snapshot: { ...event, version: event.version + 1 } });
  expect(result.current.conflict).toBe(true);
});

it("keeps a recovered draft's row keys unique and rejects duplicate or excess dates", () => {
  const { wrapper } = setup();
  const recovered: EventRecordDraft = {
    ...eventDraft(),
    visibility: undefined,
    dates: Array.from({ length: MAX_EVENT_OPTIONS - 1 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      day: `2030-06-${String(index + 1).padStart(2, "0")}`,
    })),
    tables: [{ ...tableDraft(plannedTable, "Europe/Rome"), id: undefined, key: "new-1" }],
  };
  const { result } = renderHook(
    () => useEventRecordForm(options, undefined, undefined, recovered),
    { wrapper },
  );
  const draft = result.current.draft;
  act(() => {
    result.current.addDate("");
    result.current.addDate(`${draft.dates[0].day}T${draft.startTime}`);
    result.current.addDate("2030-07-01");
    result.current.addDate("2030-07-02T20:00");
    result.current.addTable();
  });
  expect(result.current.draft.visibility).toBe("PRIVATE");
  expect(result.current.draft.dates).toHaveLength(MAX_EVENT_OPTIONS);
  expect(result.current.draft.dates.at(-1)).toMatchObject({ day: "2030-07-01" });
  expect(result.current.draft.dates.at(-1)?.startTime).toBeUndefined();
  expect(result.current.draft.tables.map(({ key }) => key)).toEqual(["new-1", "new-2"]);
  act(() => result.current.removeTable("new-2"));
  expect(result.current.draft.removedTableIds).toEqual([]);
});

it("leaves the draft invalid at the group step after authority is revoked", () => {
  const { client, wrapper } = setup();
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), {
    ...groupRecord,
    canInvite: false,
  });
  const { result } = renderHook(() => useEventRecordForm(options, undefined, groupRecord.id), {
    wrapper,
  });
  act(() => {
    expect(result.current.validate()).toEqual({ success: false });
    result.current.goToStep(4);
    result.current.next();
  });
  expect(result.current.step).toBe(0);
  expect(result.current.fieldError("groupId")).toBe(true);
  expect(result.current.validationAttempt).toBe(2);
});
