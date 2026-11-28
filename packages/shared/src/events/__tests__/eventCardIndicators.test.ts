import type { PlannedTableResponse, TableCardSummary } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  confirmedEventCardTables,
  eventCardRoles,
  eventCardState,
  tableCardRoles,
  tableCardState,
} from "../eventCardIndicators";
import type { ClientEventRecord } from "../eventOptimisticCreation";

const event = (patch: Partial<ClientEventRecord> = {}): ClientEventRecord =>
  ({
    status: "CONFIRMED",
    myRegistrations: [],
    canManage: false,
    ...patch,
  }) as ClientEventRecord;
const table = (patch: Partial<PlannedTableResponse> = {}): PlannedTableResponse =>
  ({
    eventStatus: "CONFIRMED",
    myRegistration: null,
    myPosition: null,
    confirmed: { gameId: 1, startsAt: "2030-01-01T10:00:00Z", playerIds: [] },
    ...patch,
  }) as PlannedTableResponse;
const summary = (patch: Partial<TableCardSummary> = {}): TableCardSummary => ({
  tableId: "table",
  name: "Table",
  confirmed: true,
  ready: false,
  blockers: [],
  myParticipation: "NONE",
  exclusionReasons: [],
  winners: [],
  ...patch,
});
const registration = (patch: Partial<ClientEventRecord["myRegistrations"][number]> = {}) =>
  ({
    id: "registration",
    tableId: "table",
    eventId: "event",
    userId: "actor",
    kind: "SELF",
    status: "ACCEPTED",
    ...patch,
  }) as ClientEventRecord["myRegistrations"][number];

describe("card role disclosure", () => {
  it("keeps simultaneous Event roles but never derives a seat from queue consent", () => {
    expect(
      eventCardRoles(
        event({
          status: "PLANNING",
          canManage: true,
          managementRole: "moderator",
          myDemonstrator: true,
          myRegistrations: [
            registration({ position: "WAITING" }),
            registration({ status: "PENDING", kind: "SELF" }),
            registration({ status: "PENDING", kind: "INVITATION" }),
            registration({ position: "SEATED" }),
          ],
          cardSummary: { ready: true, tables: [summary({ myParticipation: "CONFIRMED" })] },
        }),
      ),
    ).toEqual([
      "moderator",
      "demonstrator",
      "invitedParticipant",
      "waitingParticipant",
      "acceptedParticipant",
    ]);
    expect(
      eventCardRoles(
        event({
          status: "PLANNING",
          canManage: true,
          myRegistrations: [registration({ position: "WAITING" })],
        }),
      ),
    ).toEqual(["waitingParticipant"]);
    expect(
      eventCardRoles(
        event({
          myRegistrations: [
            registration(),
            registration({ status: "CANCELLED", position: "WAITING" }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      eventCardRoles(event({ myRegistrations: [registration({ position: "FROZEN" })] })),
    ).toEqual(["acceptedParticipant"]);
    expect(eventCardRoles(event({ cardSummary: { ready: false, tables: [] } }))).toEqual([]);
  });
  it("suppresses optimistic and stale private roles, while trusting a server-owned frozen summary", () => {
    const privileged = event({
      canManage: true,
      managementRole: "admin",
      myDemonstrator: true,
      myRegistrations: [registration({ position: "SEATED" })],
    });
    expect(
      eventCardRoles({ ...privileged, optimistic: { draftId: "draft", phase: "saving" } }),
    ).toEqual([]);
    expect(eventCardRoles({ ...privileged, readOnly: true })).toEqual([]);
    expect(
      eventCardRoles({
        ...privileged,
        readOnly: true,
        cardSummary: { ready: false, tables: [summary({ myParticipation: "CONFIRMED" })] },
      }),
    ).toEqual(["acceptedParticipant"]);
    expect(
      eventCardRoles(
        event({ managementRole: "admin", cardSummary: { ready: false, tables: [summary()] } }),
      ),
    ).toEqual([]);
  });
  it("keeps inherited Table authority separate from pending and waiting consent", () => {
    expect(
      tableCardRoles(
        table({
          canManage: true,
          managementRole: "admin",
          demonstratorUserId: "actor",
          myRegistration: registration({ kind: "INVITATION", status: "PENDING" }),
          myPosition: "WAITING",
        }),
        "actor",
      ),
    ).toEqual(["admin", "demonstrator", "invitedPlayer", "waitingPlayer"]);
    expect(tableCardRoles(table({ canManage: true }), null)).toEqual([]);
    expect(
      tableCardRoles(
        table({ eventStatus: "PLANNING", myRegistration: registration(), myPosition: "SEATED" }),
        "actor",
      ),
    ).toEqual(["confirmedPlayer"]);
    expect(
      tableCardRoles(
        table({ readOnly: true, personalAccessOnly: true, demonstratorUserId: "actor" }),
        "actor",
      ),
    ).toEqual(["demonstrator"]);
    expect(
      eventCardRoles(event({ readOnly: true, personalAccessOnly: true, myDemonstrator: true })),
    ).toEqual(["demonstrator"]);
    expect(
      tableCardRoles(table({ managementRole: "admin", demonstratorUserId: "other" }), "actor"),
    ).toEqual([]);
    expect(
      tableCardRoles(
        table({ readOnly: true, canManage: true, managementRole: "admin", myPosition: "FROZEN" }),
        "actor",
      ),
    ).toEqual([]);
    expect(
      tableCardRoles(
        table({ readOnly: true, cardSummary: summary({ myParticipation: "CONFIRMED" }) }),
        undefined,
      ),
    ).toEqual(["confirmedPlayer"]);
    expect(
      tableCardRoles(
        table({
          myRegistration: registration(),
          myPosition: "FROZEN",
          cardSummary: summary({ myParticipation: "CONFIRMED" }),
        }),
        "actor",
      ),
    ).toEqual(["confirmedPlayer"]);
    expect(tableCardRoles(table({ cardSummary: summary() }), "actor")).toEqual([]);
  });
});

describe("personal confirmation colors", () => {
  it("uses warning and primary for actual lifecycle states", () => {
    expect(eventCardState(event({ status: "PLANNING" }))).toBe("PLANNING");
    expect(eventCardState(event({ status: "TERMINATED" }))).toBe("TERMINATED");
    expect(tableCardState(table({ eventStatus: "PLANNING", confirmed: undefined }), "actor")).toBe(
      "PLANNING",
    );
    expect(tableCardState(table({ eventStatus: "TERMINATED" }), "actor")).toBe("TERMINATED");
  });
  it("keeps Events green for at least one included Table, even with other exclusions", () => {
    expect(
      eventCardState(
        event({
          cardSummary: {
            ready: false,
            tables: [
              summary({ myParticipation: "EXCLUDED" }),
              summary({ myParticipation: "CONFIRMED" }),
            ],
          },
        }),
      ),
    ).toBe("CONFIRMED");
    expect(eventCardState(event({ myRegistrations: [registration({ position: "FROZEN" })] }))).toBe(
      "CONFIRMED",
    );
  });
  it.each(["admin", "moderator", "demonstrator"] as const)(
    "shows %s primary without a seat, but exclusion takes precedence",
    (role) => {
      const duty =
        role === "demonstrator"
          ? { myDemonstrator: true }
          : { canManage: true, managementRole: role };
      expect(eventCardState(event(duty))).toBe("DUTY");
      expect(
        eventCardState(
          event({
            ...duty,
            cardSummary: { ready: false, tables: [summary({ myParticipation: "EXCLUDED" })] },
          }),
        ),
      ).toBe("EXCLUDED");
      const tableDuty =
        role === "demonstrator"
          ? { demonstratorUserId: "actor" }
          : { canManage: true, managementRole: role };
      expect(tableCardState(table(tableDuty), "actor")).toBe("DUTY");
      expect(
        tableCardState(
          table({ ...tableDuty, cardSummary: summary({ myParticipation: "EXCLUDED" }) }),
          "actor",
        ),
      ).toBe("EXCLUDED");
    },
  );
  it("does not confuse observers, cancelled registrations and missing cached summaries with exclusion", () => {
    expect(eventCardState(event())).toBe("OBSERVER");
    expect(
      eventCardState(
        event({
          myRegistrations: [registration({ position: "SEATED" })],
          cardSummary: { ready: false, tables: [summary({ myParticipation: "EXCLUDED" })] },
        }),
      ),
    ).toBe("EXCLUDED");
    expect(
      eventCardState(
        event({
          myRegistrations: [registration({ position: "SEATED" })],
          cardSummary: { ready: false, tables: [] },
        }),
      ),
    ).toBe("OBSERVER");
    expect(
      tableCardState(
        table({
          myRegistration: registration(),
          myPosition: "SEATED",
          cardSummary: summary({ myParticipation: "EXCLUDED" }),
        }),
        "actor",
      ),
    ).toBe("EXCLUDED");
    expect(
      eventCardState(event({ myRegistrations: [registration({ status: "CANCELLED" })] })),
    ).toBe("OBSERVER");
    expect(eventCardState(event({ readOnly: true, myRegistrations: [registration()] }))).toBe(
      "OBSERVER",
    );
    expect(eventCardState(event({ myRegistrations: [registration()] }))).toBe("UNKNOWN");
    expect(eventCardState(event({ myRegistrations: [registration({ status: "PENDING" })] }))).toBe(
      "UNKNOWN",
    );
    expect(tableCardState(table(), "actor")).toBe("OBSERVER");
    expect(
      tableCardState(table({ myRegistration: registration({ status: "CANCELLED" }) }), "actor"),
    ).toBe("OBSERVER");
    expect(tableCardState(table({ readOnly: true, myRegistration: registration() }), "actor")).toBe(
      "OBSERVER",
    );
    expect(tableCardState(table({ myRegistration: registration() }), "actor")).toBe("EXCLUDED");
    expect(
      tableCardState(table({ myRegistration: registration({ status: "PENDING" }) }), "actor"),
    ).toBe("EXCLUDED");
  });
  it("separates a wholly excluded Table from an included Table with an excluded player", () => {
    expect(tableCardState(table({ confirmed: undefined }), "actor")).toBe("TABLE_EXCLUDED");
    expect(tableCardState(table({ myPosition: "FROZEN" }), "actor")).toBe("OBSERVER");
    expect(
      tableCardState(
        table({ confirmed: { gameId: 1, startsAt: "2030-01-01T00:00:00Z", playerIds: ["actor"] } }),
        "actor",
      ),
    ).toBe("CONFIRMED");
    expect(
      tableCardState(table({ cardSummary: summary({ myParticipation: "CONFIRMED" }) }), "actor"),
    ).toBe("CONFIRMED");
  });
});

it("lists each included own seat or demonstration once and only for confirmed Events", () => {
  const seatAndDemo = summary({ myParticipation: "CONFIRMED", myDemonstrator: true });
  const demo = summary({ tableId: "demo", myDemonstrator: true });
  const oldSeat = summary({ tableId: "old-seat", myParticipation: "CONFIRMED" });
  const cardSummary = {
    ready: true,
    tables: [
      seatAndDemo,
      demo,
      oldSeat,
      summary({ tableId: "excluded", confirmed: false, myDemonstrator: true }),
      summary({ tableId: "unknown", myParticipation: "EXCLUDED" }),
      summary({ tableId: "other", myDemonstrator: false }),
    ],
  };
  expect(confirmedEventCardTables(event({ cardSummary }))).toEqual([seatAndDemo, demo, oldSeat]);
  expect(confirmedEventCardTables(event({ status: "TERMINATED", cardSummary }))).toEqual([]);
  expect(confirmedEventCardTables(event({ status: "PLANNING", cardSummary }))).toEqual([]);
  expect(confirmedEventCardTables(event())).toEqual([]);
});
