"use client";

import type {
  BggSearchItem,
  PlannedEventResponse,
  VerifiedLocation,
} from "@board-game-organizer/schemas";
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
import { useEventCutoff } from "./useEventCutoff";
import { useRecordTables } from "./useEventRecords";
export function useEventRecordForm(
  options: CommunityApiOptions,
  event: PlannedEventResponse | undefined,
  initialGroupId?: string,
) {
  const [draft, setDraft] = useState(() => eventDraft(event, initialGroupId)),
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
    if (!existingId && approvedLocation)
      setDraft((old) =>
        old.locations.length ? old : patchEventDraft(old, { locations: [approvedLocation] }),
      );
  }, [existingId, approvedLocation]);
  const groupLocked = Boolean(event || initialGroupId);
  const patch = (change: Partial<EventRecordDraft>) =>
    setDraft((old) => {
      if (groupLocked && change.groupId !== undefined && change.groupId !== old.groupId) return old;
      return patchEventDraft(old, change, event?.dates);
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
          startsWall: old.dates[0] ? `${old.dates[0].day}T${old.startTime}` : "",
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
  const addDate = (day: string) => {
    if (!day) return;
    setDraft((old) =>
      old.dates.length
        ? old
        : { ...old, dates: [{ id: eventDateOptionId(event?.dates ?? []), day }] },
    );
  };
  const addLocation = (location: VerifiedLocation) =>
    setDraft((old) =>
      old.locations.length ? old : patchEventDraft(old, { locations: [location] }, event?.dates),
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
  const issues = eventDraftStepIssues(draft, group?.type === "PUBLIC", step);
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
    const value = closed
      ? { success: false as const }
      : eventDraftInput(draft, group?.type === "PUBLIC");
    setError(!value.success);
    return value;
  };
  return {
    draft,
    group,
    groupLocked,
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
