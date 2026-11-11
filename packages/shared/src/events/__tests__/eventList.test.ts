import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import {
  eventMatchesFilters,
  isPersonalEventTableVisible,
  isPersonalTableParticipant,
  personalEventSection,
  personalTableSection,
} from "../eventList";

it("partitions Events by participation and current management authority", () => {
  const event = {
    groupId: null,
    adminUserId: "owner",
    role: "admin",
    myRegistrations: [],
  } as unknown as PlannedEventResponse;
  expect(personalEventSection(event, "owner")).toBe("mine");
  expect(personalEventSection(event, "other")).toBeNull();
  expect(personalEventSection({ ...event, groupId: "group" }, "other")).toBe("available");
  expect(personalEventSection({ ...event, groupId: "group", canManage: true }, "other")).toBe(
    "mine",
  );
  expect(personalEventSection({ ...event, groupId: "group", canManage: false }, "owner")).toBe(
    "available",
  );
  expect(personalEventSection({ ...event, myDemonstrator: true }, "owner")).toBe("mine");
  expect(personalEventSection({ ...event, role: "demonstrator" }, "other")).toBe("mine");
  for (const status of ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"] as const) {
    const own = { userId: "owner", status } as TableRegistration;
    expect(personalEventSection({ ...event, myRegistrations: [own] }, "owner")).toBe("mine");
    expect(personalEventSection({ ...event, myRegistrations: [own] }, "other")).toBeNull();
    expect(
      personalEventSection(
        { ...event, groupId: "group", canManage: false, myRegistrations: [own] },
        "owner",
      ),
    ).toBe(status === "PENDING" || status === "ACCEPTED" ? "mine" : "available");
  }
});

it("splits seated/frozen/demonstrator Tables from invitations, requests and queue; unknown/foreign/admin-only are absent", () => {
  const table = {
    eventStatus: "PLANNING",
    myRegistration: null,
    myPosition: null,
  } as PlannedTableResponse;
  expect(personalTableSection(table, "owner")).toBeNull();
  expect(personalTableSection({ ...table, demonstratorUserId: "owner" }, "owner")).toBe("mine");
  const confirmed = { gameId: 1, playerIds: ["owner"], startsAt: "2030-01-01T00:00:00Z" };
  for (const eventStatus of ["CONFIRMED", "TERMINATED"] as const) {
    expect(personalTableSection({ ...table, eventStatus }, "owner")).toBeNull();
    expect(personalTableSection({ ...table, eventStatus, confirmed }, "owner")).toBe("mine");
    expect(personalTableSection({ ...table, eventStatus, confirmed }, "other")).toBeNull();
  }
  expect(personalTableSection({ ...table, confirmed }, "owner")).toBeNull();
  for (const kind of ["INVITATION", "SELF"] as const) {
    const own = { userId: "owner", kind, status: "PENDING" } as TableRegistration;
    expect(
      personalTableSection({ ...table, myRegistration: own, myPosition: "SEATED" }, "owner"),
    ).toBe("waiting");
    expect(personalTableSection({ ...table, myRegistration: own }, "other")).toBeNull();
    expect(
      personalTableSection({ ...table, myRegistration: own, demonstratorUserId: "owner" }, "owner"),
    ).toBe("mine");
    for (const status of ["ACCEPTED", "DECLINED", "CANCELLED"] as const) {
      for (const myPosition of [undefined, null, "SEATED", "WAITING", "FROZEN"] as const) {
        const row = {
          ...table,
          myRegistration: { ...own, status },
          myPosition,
        } as PlannedTableResponse;
        expect(personalTableSection(row, "owner")).toBe(
          status !== "ACCEPTED"
            ? null
            : myPosition === "WAITING"
              ? "waiting"
              : myPosition === "SEATED" || myPosition === "FROZEN"
                ? "mine"
                : null,
        );
      }
    }
  }
});

it("shows only frozen confirmed players in the combined personal Table list", () => {
  const base = { eventStatus: "PLANNING", myRegistration: null } as PlannedTableResponse;
  expect(isPersonalTableParticipant(base, "owner")).toBe(false);
  expect(isPersonalTableParticipant({ ...base, demonstratorUserId: "owner" }, "owner")).toBe(false);
  for (const status of ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"] as const) {
    const table = { ...base, myRegistration: { userId: "owner", status } as TableRegistration };
    expect(isPersonalTableParticipant(table, "owner")).toBe(false);
    expect(isPersonalTableParticipant(table, "foreign")).toBe(false);
    expect(personalTableSection(table, "owner")).toBe(status === "PENDING" ? "waiting" : null);
  }
  for (const eventStatus of ["CONFIRMED", "TERMINATED"] as const) {
    expect(
      isPersonalTableParticipant({ ...base, eventStatus, demonstratorUserId: "owner" }, "owner"),
    ).toBe(false);
    const table = {
      ...base,
      eventStatus,
      confirmed: { gameId: 1, playerIds: ["owner"], startsAt: "2030-01-01T00:00:00Z" },
    };
    expect(isPersonalTableParticipant(table, "owner")).toBe(true);
    expect(isPersonalTableParticipant(table, "foreign")).toBe(false);
  }
});

it("hides excluded confirmed/terminated Tables but retains planning Tables and frozen outcomes", () => {
  for (const eventStatus of ["PLANNING", "CONFIRMED", "TERMINATED"] as const) {
    expect(isPersonalEventTableVisible({ eventStatus })).toBe(eventStatus === "PLANNING");
    expect(
      isPersonalEventTableVisible({
        eventStatus,
        confirmed: { gameId: 1, playerIds: ["one", "two"], startsAt: "2030-06-03T18:00:00Z" },
      }),
    ).toBe(true);
  }
});
it("reconciles renamed, ended and cancelled events against list search and period filters", () => {
  const now = Date.parse("2030-01-01T20:00:00.000Z");
  const row = {
    name: "Board Evening",
    status: "PUBLISHED" as const,
    endsAt: new Date(now + 1).toISOString(),
  };
  expect(eventMatchesFilters(row, "BOARD", ["future"], now)).toBe(true);
  expect(eventMatchesFilters(row, "Board", ["past"], now)).toBe(false);
  expect(
    eventMatchesFilters({ ...row, endsAt: new Date(now).toISOString() }, "", ["past"], now),
  ).toBe(true);
  expect(
    eventMatchesFilters({ ...row, endsAt: new Date(now - 1).toISOString() }, "", ["future"], now),
  ).toBe(false);
  expect(eventMatchesFilters(row, "Other", ["future", "past"], now)).toBe(false);
  expect(eventMatchesFilters(row, "", [], now)).toBe(false);
  expect(eventMatchesFilters({ ...row, endsAt: "invalid" }, "", ["future", "past"], now)).toBe(
    false,
  );
  expect(eventMatchesFilters({ ...row, status: "CANCELLED" }, "", ["future", "past"], now)).toBe(
    false,
  );
  expect(eventMatchesFilters(row, "", ["future", "past"])).toBe(true);
});
