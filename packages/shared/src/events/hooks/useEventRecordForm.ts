"use client";

import type {
  BggSearchItem,
  PlannedEventResponse,
  VerifiedLocation,
} from "@board-game-organizer/schemas";
import { MAX_EVENT_OPTIONS } from "@board-game-organizer/schemas";
import { useEffect, useRef, useState } from "react";
import type { CommunityApiOptions } from "../../community/communityApi";
import { communityAccessDenied } from "../../community/communityApi";
import { useGroupRecord } from "../../groups/hooks/useGroupRecords";
import {
  type EventRecordDraft,
  type EventTableDraft,
  eventDateOptionId,
  eventDraft,
  eventDraftInput,
  eventDraftStepIssues,
  newTableDraft,
  patchEventDraft,
  tableDraft,
} from "../eventRecordForm";
import { eventDateWall } from "../eventRecordPolicy";
import { nextEventDay, publicEventEndIsValid } from "../eventSchedule";
import { useEventCutoff } from "./useEventCutoff";
import { useRecordTables } from "./useEventRecords";
export function useEventRecordForm(
  options: CommunityApiOptions,
  event: PlannedEventResponse | undefined,
  initialGroupId?: string,
  recoveredDraft?: EventRecordDraft,
) {
  const [draft, setDraft] = useState(() => recoveredDraft ?? eventDraft(event, initialGroupId)),
    [error, setError] = useState(false),
    [step, setStep] = useState(0),
    [attempted, setAttempted] = useState([false, false]),
    serial = useRef(0);
  const groupQuery = useGroupRecord(
      { ...options, enabled: options.enabled !== false && Boolean(draft.groupId) },
      draft.groupId ?? "",
    ),
    group = communityAccessDenied(groupQuery.error) ? undefined : groupQuery.data;
  const tables = useRecordTables(
    { ...options, enabled: options.enabled !== false && Boolean(event) },
    event?.id ?? "",
  );
  const existingId = event?.id,
    loadedTables = tables.items,
    approvedLocation = group?.approved?.location;
  useEffect(() => {
    if (!existingId) return;
    setDraft((old) => {
      const added = loadedTables.filter(
        (row) => !old.tables.some((t) => t.id === row.id) && !old.removedTableIds.includes(row.id),
      );
      return added.length
        ? { ...old, tables: [...old.tables, ...added.map((row) => tableDraft(row, old.timeZone))] }
        : old;
    });
  }, [existingId, loadedTables]);
  useEffect(() => {
    if (!existingId && approvedLocation && group?.type !== "PUBLIC")
      setDraft((old) =>
        old.locations.length ? old : patchEventDraft(old, { locations: [approvedLocation] }),
      );
  }, [existingId, approvedLocation, group?.type]);
  const groupLocked = Boolean(event || initialGroupId);
  const publicGroup = (group?.type ?? event?.groupType) === "PUBLIC";
  const flexibleSchedule = (group?.type ?? event?.groupType) === "PRIVATE";
  useEffect(() => {
    if (existingId || !publicGroup) return;
    setDraft((old) =>
      old.dates.length === 1
        ? old
        : {
            ...old,
            dates: [
              old.dates[0] ?? {
                id: eventDateOptionId([]),
                day: nextEventDay(new Date()),
                startTime: old.startTime,
              },
            ],
          },
    );
  }, [existingId, publicGroup]);
  const setStartDate = (wall: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) return;
    setDraft((old) =>
      patchEventDraft(
        old,
        {
          tables: old.tables.map((row) => ({
            ...row,
            startsWall: row.startsWall
              ? `${wall.slice(0, 10)}T${row.startsWall.slice(11, 16)}`
              : "",
          })),
          endsWall: publicEventEndIsValid(wall, old.endsWall) ? old.endsWall : "",
          cutoffWall: old.cutoffWall.slice(0, 10) < wall.slice(0, 10) ? old.cutoffWall : "",
          dates: [
            {
              id: old.dates[0]?.id ?? eventDateOptionId([]),
              day: wall.slice(0, 10),
              startTime: wall.slice(11, 16),
            },
          ],
        },
        event?.dates,
        false,
      ),
    );
  };
  const patch = (change: Partial<EventRecordDraft>) =>
    setDraft((old) => {
      if (groupLocked && change.groupId !== undefined && change.groupId !== old.groupId) return old;
      return patchEventDraft(old, change, event?.dates, flexibleSchedule);
    });
  const patchTable = (key: string, change: Partial<EventTableDraft>) =>
    setDraft((old) => ({
      ...old,
      tables: old.tables.map((row) => (row.key === key ? { ...row, ...change } : row)),
    }));
  const addTable = () => {
    if (
      (event?.tableCount ?? 0) -
        draft.removedTableIds.length +
        draft.tables.filter((row) => !row.id).length >=
      20
    )
      return;
    const key = `new-${++serial.current}`;
    setDraft((old) => ({
      ...old,
      tables: [
        ...old.tables,
        {
          ...newTableDraft(key),
          startsWall: old.dates[0] ? eventDateWall(old, old.dates[0]) : "",
        },
      ],
    }));
  };
  const removeTable = (key: string) =>
    setDraft((old) => {
      const row = old.tables.find((t) => t.key === key);
      return {
        ...old,
        tables: old.tables.filter((t) => t.key !== key),
        removedTableIds: row?.id ? [...old.removedTableIds, row.id] : old.removedTableIds,
      };
    });
  const addDate = (wall: string) => {
    if (!wall) return;
    setDraft((old) => {
      const day = wall.slice(0, 10),
        startTime = wall.slice(11, 16);
      if (
        old.dates.length >= (flexibleSchedule ? MAX_EVENT_OPTIONS : 1) ||
        old.dates.some(
          (date) => eventDateWall(old, date) === `${day}T${startTime || old.startTime}`,
        )
      )
        return old;
      return {
        ...old,
        dates: [
          ...old.dates,
          {
            id: eventDateOptionId([...(event?.dates ?? []), ...old.dates]),
            day,
            ...(startTime ? { startTime } : {}),
          },
        ],
      };
    });
  };
  const addLocation = (location: VerifiedLocation) =>
    setDraft((old) =>
      old.locations.length >= (flexibleSchedule ? MAX_EVENT_OPTIONS : 1) ||
      old.locations.some((row) => row.id === location.id)
        ? old
        : patchEventDraft(
            old,
            { locations: [...old.locations, location] },
            event?.dates,
            flexibleSchedule,
          ),
    );
  const addGame = (key: string, game: BggSearchItem) =>
    setDraft((old) => ({
      ...old,
      tables: old.tables.map((row) =>
        row.key === key
          ? { ...row, games: [...row.games.filter((g) => g.id !== game.id), game] }
          : row,
      ),
    }));
  const closed = useEventCutoff(event?.bookingClosesAt, event?.groupType === "PUBLIC");
  const issues = eventDraftStepIssues(draft, publicGroup, step);
  const retainedCount =
    (event?.tableCount ?? 0) -
    draft.removedTableIds.length +
    draft.tables.filter((row) => !row.id).length;
  if (step === 1 && retainedCount < 1) issues.push("tables");
  if (step === 0 && draft.groupId && (!group?.canInvite || group.role !== "admin"))
    issues.push("groupId");
  const fieldError = (path: string) =>
    Boolean(
      attempted[step] && issues.some((issue) => issue === path || issue.startsWith(`${path}.`)),
    );
  const next = () => {
    setAttempted((old) => old.map((value, index) => (index === step ? true : value)));
    if (!issues.length && step < 2) setStep(step + 1);
  };
  const goToStep = (value: number) => {
    if (value >= 0 && value <= step) setStep(value);
  };
  const validate = () => {
    setAttempted([true, true]);
    const value = closed ? { success: false as const } : eventDraftInput(draft, publicGroup);
    setError(!value.success);
    return value;
  };
  return {
    draft,
    group,
    groupLocked,
    flexibleSchedule,
    publicGroup,
    setStartDate,
    step,
    goToStep,
    next,
    canNext: !attempted[step] || !issues.length,
    fieldError,
    groupQuery,
    patch,
    patchTable,
    addTable,
    removeTable,
    addDate,
    addLocation,
    addGame,
    tables,
    error,
    setError,
    validate,
    closed,
    conflict: Boolean(event && event.version !== draft.version),
  };
}
