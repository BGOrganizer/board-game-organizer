import type { EventResponse, EventTableInput } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { eventTableEditInput } from "../eventTableEditInput";

const table: EventTableInput = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Azul table",
  startsAt: "2030-06-12T14:15:30.000Z",
  endsAt: "2030-06-12T17:45:30.000Z",
  minPlayers: 2,
  maxPlayers: 4,
  gameId: 1,
  openSkill: true,
};
const event: EventResponse = {
  id: "33333333-3333-4333-8333-333333333333",
  organizationId: "44444444-4444-4444-8444-444444444444",
  adminUserId: "admin",
  name: "Games evening",
  organizationName: "Game club",
  logo: "",
  organizationApproved: true,
  tableCount: 20,
  confirmedParticipantCount: 3,
  role: "admin",
  canModify: true,
  canPublish: true,
  status: "PUBLISHED",
  location: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Club venue",
    address: "Verified address 10",
    latitude: 41,
    longitude: 12,
  },
  timeZone: "Europe/Rome",
  startsAt: "2030-06-12T14:00:30.000Z",
  endsAt: "2030-06-12T18:00:30.000Z",
  bookingClosesAt: "2030-06-11T14:00:30.000Z",
  version: 7,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
it("edits one existing table while retaining unlisted tables, event fields, seconds and version", () => {
  const result = eventTableEditInput(event, table);
  expect(result).toEqual({
    name: event.name,
    status: event.status,
    timeZone: event.timeZone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    bookingClosesAt: event.bookingClosesAt,
    location: event.location,
    version: 7,
    tables: [table],
    removedTableIds: [],
  });
  expect(result).not.toHaveProperty("confirmedParticipantCount");
  expect(eventTableEditInput({ ...event, status: "DRAFT" }, table).status).toBe("DRAFT");
});
it("preserves schema validation instead of coercing cancelled events or invalid bounds", () => {
  expect(() => eventTableEditInput({ ...event, status: "CANCELLED" }, table)).toThrow();
  expect(() => eventTableEditInput(event, { ...table, startsAt: event.startsAt })).toThrow();
  expect(() => eventTableEditInput(event, { ...table, maxPlayers: 1 })).toThrow();
});
