import type {
  EventResponse,
  EventTableInput,
  MatchLocation,
  OrganizationMemberResponse,
  SaveEventInput,
} from "@board-game-organizer/schemas";
import { eventTableInputSchema, saveEventSchema } from "@board-game-organizer/schemas";
import { eventBookingClosesAt, eventLocalDateTime, eventLocalToIso } from "./eventForm";

export type EventFormErrors = Partial<Record<string, string>>;
export type EventDraftTable = {
  key: string;
  input: EventTableInput;
  gameName: string;
  imageUrl?: string | null;
  demonstrator?: Pick<OrganizationMemberResponse, "userId" | "username" | "avatarUrl"> &
    Partial<Pick<OrganizationMemberResponse, "name">>;
};

export const EVENT_FIELD_ERRORS: Record<string, string> = {
  name: "Enter an event name with 5–120 characters.",
  timeZone: "Invalid event time zone. Reload the event and try again.",
  startsAt: "Choose a valid event start in the future.",
  endsAt: "Event end must be after event start on the same day.",
  bookingHours: "Enter positive booking hours; the deadline must still be in the future.",
  location: "Choose a verified address.",
  tables:
    "Check table times: every table must be inside the event. Publishing requires at least one table.",
};
export const TABLE_FIELD_ERRORS: Record<string, string> = {
  name: "Enter a table name with 1–120 characters.",
  startsAt: "Table start must be after event start and before event end.",
  endsAt: "Table end must be after table start and before event end.",
  minPlayers: "Minimum players must be an integer of at least 2.",
  maxPlayers: "Maximum players must be an integer at least equal to the minimum.",
  gameId: "Select a board game.",
  demonstratorUserId: "Select a confirmed organization member or remove the demonstrator.",
};

export function eventInformationForm(
  fields: {
    name: string;
    start: string;
    end: string;
    zone: string;
    bookingHours: string;
    location?: MatchLocation;
  },
  previous: EventResponse | undefined,
  now: number,
): { data: SaveEventInput | null; errors: EventFormErrors } {
  const errors: EventFormErrors = {};
  let startsAt = "",
    endsAt = "",
    bookingClosesAt = "";
  try {
    startsAt = eventLocalToIso(fields.start, fields.zone, previous?.startsAt);
  } catch {
    errors.startsAt = EVENT_FIELD_ERRORS.startsAt;
  }
  try {
    endsAt = eventLocalToIso(fields.end, fields.zone, previous?.endsAt);
  } catch {
    errors.endsAt = EVENT_FIELD_ERRORS.endsAt;
  }
  try {
    bookingClosesAt = eventBookingClosesAt(startsAt, fields.bookingHours);
  } catch {
    errors.bookingHours = EVENT_FIELD_ERRORS.bookingHours;
  }
  const parsed = saveEventSchema.safeParse({
    name: fields.name,
    timeZone: fields.zone,
    startsAt,
    endsAt,
    bookingClosesAt,
    location: fields.location,
    status: "DRAFT",
    tables: [],
  });
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === "bookingClosesAt" ? "bookingHours" : String(issue.path[0]);
      errors[field] = EVENT_FIELD_ERRORS[field];
    }
  if (Date.parse(startsAt) <= now) errors.startsAt = EVENT_FIELD_ERRORS.startsAt;
  if (Date.parse(bookingClosesAt) <= now) errors.bookingHours = EVENT_FIELD_ERRORS.bookingHours;
  return { data: parsed.success && !Object.keys(errors).length ? parsed.data : null, errors };
}

export function eventTableForm(fields: {
  input: EventTableInput;
  start: string;
  end: string;
  zone: string;
  eventStart: string;
  eventEnd: string;
}): { data: EventTableInput | null; errors: EventFormErrors } {
  const errors: EventFormErrors = {};
  let startsAt = "",
    endsAt = "";
  try {
    startsAt = eventLocalToIso(fields.start, fields.zone, fields.input.startsAt);
  } catch {
    errors.startsAt = "Choose a valid date and time; this local time may not exist.";
  }
  try {
    endsAt = eventLocalToIso(fields.end, fields.zone, fields.input.endsAt);
  } catch {
    errors.endsAt = "Choose a valid date and time; this local time may not exist.";
  }
  const parsed = eventTableInputSchema.safeParse({ ...fields.input, startsAt, endsAt });
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      errors[field] ??= TABLE_FIELD_ERRORS[field] ?? "Check this field.";
    }
  if (
    Date.parse(startsAt) <= Date.parse(fields.eventStart) ||
    Date.parse(startsAt) >= Date.parse(fields.eventEnd)
  )
    errors.startsAt = TABLE_FIELD_ERRORS.startsAt;
  if (Date.parse(endsAt) >= Date.parse(fields.eventEnd)) errors.endsAt = TABLE_FIELD_ERRORS.endsAt;
  return { data: parsed.success && !Object.keys(errors).length ? parsed.data : null, errors };
}

/** Minute-based UI bounds are strict; conversion still preserves unchanged stored seconds/DST. */
export function eventDateLimit(
  wall: string,
  zone: string,
  edge: "after" | "before",
  previous?: string,
): string | undefined {
  try {
    const instant = Date.parse(eventLocalToIso(wall, zone, previous));
    const minute =
      edge === "after" ? Math.floor(instant / 60000) + 1 : Math.ceil(instant / 60000) - 1;
    return eventLocalDateTime(new Date(minute * 60000).toISOString(), zone).slice(0, 16);
  } catch {
    return undefined;
  }
}

export function eventPlayerRange(
  minPlayers: number,
  maxPlayers: number,
  field: "minPlayers" | "maxPlayers",
  delta: number,
) {
  const min = field === "minPlayers" ? Math.max(2, minPlayers + delta) : minPlayers;
  const max =
    field === "maxPlayers" ? Math.max(min, maxPlayers + delta) : Math.max(min, maxPlayers);
  return { minPlayers: min, maxPlayers: max };
}

export function eventSaveFieldErrors(error: unknown): EventFormErrors {
  if (!(error instanceof Error)) return {};
  const fields: Record<string, EventFormErrors> = {
    BOOKING_DEADLINE_PASSED: { bookingHours: EVENT_FIELD_ERRORS.bookingHours },
    EVENT_MUST_BE_FUTURE: { startsAt: EVENT_FIELD_ERRORS.startsAt },
    TABLE_OUTSIDE_EVENT: { tables: EVENT_FIELD_ERRORS.tables },
    EVENT_REQUIRES_TABLE: { tables: EVENT_FIELD_ERRORS.tables },
    EVENT_TABLE_LIMIT: { tables: "An event can have at most 20 tables." },
    GAME_NOT_FOUND: {
      tables: "A selected game is unavailable. Edit the affected table and choose another game.",
    },
    ORGANIZATION_MEMBER_REQUIRED: {
      tables:
        "A demonstrator is no longer a confirmed member. Edit the affected table and remove or replace them.",
    },
  };
  return Object.hasOwn(fields, error.message) ? fields[error.message] : {};
}

/** Changing the day preserves selected wall-clock times; empty times stay unselected. */
export function eventOnDay(wall: string, day: string): string {
  return wall && day ? `${day}T${wall.slice(11)}` : "";
}

/** Include retained, unloaded tables; editing an existing table adds no position. */
export function eventDraftTableCount(
  existing: number,
  edited: EventDraftTable[],
  removed: string[],
): number {
  return existing - new Set(removed).size + edited.filter((table) => !table.input.id).length;
}
