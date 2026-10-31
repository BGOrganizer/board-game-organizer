import type {
  CreatePlannedEventInput,
  EditPlannedEventInput,
  GroupRecordResponse,
  PlannedEventResponse,
} from "@board-game-organizer/schemas";
import { type ClientRecord, type CreationIntent, creationState } from "../common/clientMutation";
import { eventLocalDateTime } from "./eventForm";
import type { EventRecordDraft } from "./eventRecordForm";

export type CreateEventVariables = CreatePlannedEventInput & {
  clientDraft?: EventRecordDraft;
  clientInitialGroupId?: string;
  clientGroup?: Pick<GroupRecordResponse, "id" | "name" | "type">;
};
export type EditEventVariables = EditPlannedEventInput & { clientDraft?: EventRecordDraft };
export type ClientEventRecord = ClientRecord<PlannedEventResponse>;
export type EventCreationIntent = CreationIntent<CreateEventVariables, PlannedEventResponse>;

export function eventCreationRecord(
  intent: EventCreationIntent,
  userId: string,
): ClientEventRecord {
  if (intent.context?.receipt)
    return { ...intent.context.receipt, optimistic: creationState(intent) };
  const input = intent.variables;
  const group = input.clientGroup?.id === input.groupId ? input.clientGroup : undefined;
  const at = new Date(intent.submittedAt).toISOString();
  return {
    id: `optimistic:${input.clientRequestId ?? intent.draftId}`,
    clientRequestId: input.clientRequestId,
    groupId: input.groupId,
    adminUserId: userId,
    name: input.name,
    dates: input.dates,
    locations: input.locations,
    timeZone: input.timeZone,
    startTime: input.startTime,
    ...(input.endsAt ? { endsAt: input.endsAt } : {}),
    ...(input.bookingClosesAt ? { bookingClosesAt: input.bookingClosesAt } : {}),
    status: "PLANNING",
    version: 1,
    planningGeneration: 1,
    createdAt: at,
    updatedAt: at,
    groupName: group?.name ?? null,
    groupType: group?.type ?? null,
    role: "admin",
    myRegistrations: [],
    tableCount: input.tables.length,
    participantCount: 0,
    canEdit: false,
    canInvite: false,
    canRegister: false,
    canVote: false,
    canConfirm: false,
    canReplan: false,
    canFinalize: false,
    optimistic: creationState(intent),
  };
}

/** Match unified source paging: unchosen non-public dates belong to both periods. */
export function eventCreationMatches(
  row: PlannedEventResponse,
  filters: { groupId?: string; query?: string; periods?: readonly ("past" | "future")[] },
  now = Date.now(),
) {
  if (filters.groupId && filters.groupId !== row.groupId) return false;
  if (filters.query && !row.name.toLowerCase().includes(filters.query.trim().toLowerCase()))
    return false;
  const periods = filters.periods;
  if (!periods) return true;
  if (!periods.length) return false;
  const day =
    row.groupType === "PUBLIC"
      ? row.dates[0].day
      : row.status === "PLANNING"
        ? undefined
        : row.dates.find((date) => date.id === row.confirmed?.dateId)?.day;
  if (!day) return true;
  const today = eventLocalDateTime(new Date(now).toISOString(), row.timeZone).slice(0, 10);
  return periods.includes(day < today ? "past" : "future");
}
