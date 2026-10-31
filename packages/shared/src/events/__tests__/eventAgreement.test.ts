import { describe, expect, it } from "vitest";
import {
  type AgreementRegistration,
  type AgreementVote,
  allocateReservedPlaces,
  calculateEventAgreement,
  type EventAgreementInput,
  projectReservedPlaces,
} from "../eventAgreement";

function fixture(users = ["a", "b"], max = users.length): EventAgreementInput {
  return {
    dateIds: ["d"],
    locationIds: ["l"],
    fixedDateAndLocation: false,
    tables: [{ id: "t", minPlayers: 2, maxPlayers: max, gameIds: [1], fixedGame: false }],
    registrations: users.map((userId, sequence) => ({
      id: userId,
      tableId: "t",
      userId,
      status: "ACCEPTED",
      priorityAt: "2027-01-01T00:00:00Z",
      sequence,
    })),
    dateVotes: Object.fromEntries(users.map((id) => [id, { d: "YES" }])),
    locationVotes: Object.fromEntries(users.map((id) => [id, { l: "YES" }])),
    gameVotes: { t: Object.fromEntries(users.map((id) => [id, { "1": "YES" }])) },
  };
}
function votes(
  input: EventAgreementInput,
  kind: "dateVotes" | "locationVotes",
  userId: string,
  vote: AgreementVote,
): EventAgreementInput {
  const option = kind === "dateVotes" ? "d" : "l";
  return { ...input, [kind]: { ...input[kind], [userId]: { [option]: vote } } };
}
function game(
  input: EventAgreementInput,
  userId: string,
  vote: AgreementVote,
): EventAgreementInput {
  return { ...input, gameVotes: { t: { ...input.gameVotes.t, [userId]: { "1": vote } } } };
}
function pending(input: EventAgreementInput, userId: string): EventAgreementInput {
  return {
    ...input,
    registrations: input.registrations.map((row) =>
      row.userId === userId ? { ...row, status: "PENDING" } : row,
    ),
  };
}

describe("reserved temporal places", () => {
  it("uses invitation/request timestamp, then sequence and stable identity, never acceptance or input order", () => {
    const rows = fixture(["a", "b", "c"]).registrations;
    const old = { ...rows[2], priorityAt: "2026-12-31T23:59:59Z", status: "PENDING" as const };
    expect(allocateReservedPlaces([rows[1], rows[0], old], 2)).toEqual({
      seated: [old, rows[0]],
      waiting: [rows[1]],
    });
    expect(allocateReservedPlaces([{ ...rows[1], sequence: 0 }, rows[0]], 1).seated[0].userId).toBe(
      "a",
    );
    expect(allocateReservedPlaces([], 2)).toEqual({ seated: [], waiting: [] });
  });
  it("pending invite reserves a place but never votes or contributes to minimum, even with forged YES votes", () => {
    const result = calculateEventAgreement(pending(fixture(), "a"));
    expect(result.agreed).toBe(false);
    expect(result.tables[0]).toMatchObject({
      reason: "PENDING_RESERVATIONS",
      pendingReservedIds: ["a"],
      initialSeatedIds: ["b"],
    });
  });
  it("cannot displace a pending reservation with an accepted waiter", () => {
    const input = pending(fixture(["a", "b", "c"], 2), "a");
    expect(calculateEventAgreement(input).agreed).toBe(false);
    const accepted = {
      ...input,
      registrations: input.registrations.map((row) => ({ ...row, status: "ACCEPTED" as const })),
    };
    const result = calculateEventAgreement(accepted);
    expect(result.agreed && result.includedTables[0].participantIds).toEqual(["a", "b"]);
    expect(result.agreed && result.includedTables[0].waitingIds).toEqual(["c"]);
  });
});

describe("per-table agreement phases", () => {
  it("A uses seated players only; accepts IF_NEEDED and never imports waiting votes", () => {
    const input = votes(
      game(fixture(["a", "b", "c"], 2), "b", "IF_NEEDED"),
      "dateVotes",
      "b",
      "IF_NEEDED",
    );
    const result = calculateEventAgreement(input);
    expect(result.agreed).toBe(true);
    expect(result.tables[0]).toMatchObject({ phase: "SEATED", consideredWaitingIds: [] });
    expect(result.agreed && result.participantIds).toEqual(["a", "b"]);
    expect(result.agreed && result.yesGameVotes).toBe(1);
  });
  it("B reports game disagreement rather than replacing a seated NO/UNKNOWN with a waiter", () => {
    for (const value of ["NO", "UNKNOWN"] as const) {
      const result = calculateEventAgreement(game(fixture(["a", "b", "c"], 2), "b", value));
      expect(result.agreed).toBe(false);
      expect(result.tables[0].reason).toBe("GAME_DISAGREEMENT");
    }
  });
  it("C stops at first successful temporal prefix and displaces only incompatible seated players", () => {
    let input = fixture(["a", "b", "c", "d", "e"], 3);
    input = { ...input, tables: [{ ...input.tables[0], minPlayers: 3 }] };
    input = votes(input, "dateVotes", "b", "NO");
    input = votes(input, "locationVotes", "c", "NO");
    const result = calculateEventAgreement(input);
    expect(result.agreed && result.includedTables[0].participantIds).toEqual(["a", "d", "e"]);
    expect(result.tables[0]).toMatchObject({ phase: "WAITING", consideredWaitingIds: ["d", "e"] });
    expect(result.agreed && result.includedTables[0].waitingIds).toEqual(["b", "c"]);
  });
  it("C ignores an incompatible earlier waiter but never considers later waiters after success", () => {
    let input = fixture(["a", "b", "c", "d", "e"], 2);
    input = votes(input, "dateVotes", "b", "NO");
    input = game(input, "c", "NO");
    const result = calculateEventAgreement(input);
    expect(result.agreed && result.includedTables[0].participantIds).toEqual(["a", "d"]);
    expect(result.tables[0].consideredWaitingIds).toEqual(["c", "d"]);
  });
  it("fails closed for no compatible candidates, missing votes or empty alternatives", () => {
    for (const input of [
      votes(fixture(), "dateVotes", "b", "UNKNOWN"),
      votes(fixture(), "locationVotes", "b", "NO"),
      { ...fixture(), dateVotes: {} },
      { ...fixture(), gameVotes: {} },
      { ...fixture(), dateIds: [] },
      { ...fixture(), locationIds: [] },
      { ...fixture(), tables: [] },
      { ...fixture(), tables: [{ ...fixture().tables[0], gameIds: [] }] },
    ])
      expect(calculateEventAgreement(input).agreed).toBe(false);
  });
  it.each(["NO", "UNKNOWN"] as const)(
    "fixed game identity never overrides an explicit %s ballot",
    (vote) => {
      const input = fixture();
      input.tables = [{ ...input.tables[0], fixedGame: true }];
      const result = calculateEventAgreement(game(input, "b", vote));
      expect(result.agreed).toBe(false);
      expect(result.tables[0].reason).toBe("GAME_DISAGREEMENT");
    },
  );
  it("fixed public options imply YES only for accepted registrations", () => {
    const input = {
      ...fixture(),
      fixedDateAndLocation: true,
      tables: [{ ...fixture().tables[0], fixedGame: true }],
      dateVotes: {},
      locationVotes: {},
      gameVotes: {},
    };
    const result = calculateEventAgreement(input);
    expect(result.agreed && result.yesGameVotes).toBe(2);
    // Fixed choices establish eligibility, not preference votes that bias attendance.
    expect(result.agreed && result.yesDateLocationVotes).toBe(0);
    expect(calculateEventAgreement(pending(input, "a")).agreed).toBe(false);
  });
});

it("chooses more YES over more IF_NEEDED players; distinct attendance is only a vote tie-break", () => {
  const base = fixture(["a", "b", "c", "d"], 4);
  const input: EventAgreementInput = {
    ...base,
    dateIds: ["earlier", "later"],
    dateVotes: {
      a: { earlier: "YES", later: "YES" },
      b: { earlier: "IF_NEEDED", later: "YES" },
      c: { earlier: "IF_NEEDED", later: "YES" },
      d: { earlier: "IF_NEEDED", later: "NO" },
    },
    // Isolate the date vote ordering from other dimensions.
    locationVotes: Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { l: "IF_NEEDED" }])),
    gameVotes: {
      t: Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { "1": "IF_NEEDED" }])),
    },
  };
  const result = calculateEventAgreement(input);
  expect(result.agreed && result.dateId).toBe("later");
  expect(result.agreed && result.participantIds).toEqual(["a", "b", "c"]);
});

it("ties prefer original date, location and game order, never admin preference", () => {
  const base = fixture();
  const input: EventAgreementInput = {
    ...base,
    dateIds: ["d", "d2"],
    locationIds: ["l", "l2"],
    tables: [{ ...base.tables[0], gameIds: [9, 1] }],
    dateVotes: { a: { d: "YES", d2: "YES" }, b: { d: "YES", d2: "YES" } },
    locationVotes: { a: { l: "YES", l2: "YES" }, b: { l: "YES", l2: "YES" } },
    gameVotes: { t: { a: { "9": "YES", "1": "YES" }, b: { "9": "YES", "1": "YES" } } },
  };
  const result = calculateEventAgreement(input);
  expect(
    result.agreed && [result.dateId, result.locationId, result.includedTables[0].gameId],
  ).toEqual(["d", "l", 9]);
  expect(result.situationKey).toBe(
    calculateEventAgreement({ ...input, registrations: [...input.registrations].reverse() })
      .situationKey,
  );
});

it("finds the joint distinct-player optimum rather than greedily choosing each table", () => {
  const base = fixture(["a", "b", "c", "d"], 4);
  const input: EventAgreementInput = {
    ...base,
    tables: [
      { ...base.tables[0], maxPlayers: 4, gameIds: [1, 2] },
      { ...base.tables[0], id: "u", maxPlayers: 4, gameIds: [1, 2] },
    ],
    registrations: [
      ...base.registrations,
      ...base.registrations.map((row) => ({ ...row, id: `u-${row.id}`, tableId: "u" })),
    ],
    dateVotes: Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { d: "IF_NEEDED" }])),
    locationVotes: Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { l: "IF_NEEDED" }])),
    gameVotes: {
      t: {
        a: { "1": "YES", "2": "NO" },
        b: { "1": "YES", "2": "NO" },
        c: { "1": "NO", "2": "YES" },
        d: { "1": "NO", "2": "YES" },
      },
      u: {
        a: { "1": "YES", "2": "YES" },
        b: { "1": "YES", "2": "YES" },
        c: { "1": "NO", "2": "NO" },
        d: { "1": "NO", "2": "NO" },
      },
    },
  };
  const result = calculateEventAgreement(input);
  expect(result.agreed && result.includedTables.map((row) => row.gameId)).toEqual([2, 1]);
  expect(result.agreed && result.participantIds).toEqual(["a", "b", "c", "d"]);
  expect(result.agreed && result.yesGameVotes).toBe(4);
});

it("can confirm at least one table without deleting or forcing other tables", () => {
  const base = fixture();
  const input = { ...base, tables: [...base.tables, { ...base.tables[0], id: "empty" }] };
  const result = calculateEventAgreement(input);
  expect(result.agreed && result.includedTables.map((row) => row.tableId)).toEqual(["t"]);
  expect(result.tables).toHaveLength(2);
  expect(input.tables).toHaveLength(2);
  expect(calculateEventAgreement(input).situationKey).toBe(result.situationKey);
});

it("fails closed rather than returning a partially searched optimum when work budget is exhausted", () => {
  expect(() => calculateEventAgreement(fixture(), 1)).toThrow("AGREEMENT_COMPLEXITY_LIMIT");
  const excessive = {
    ...fixture(),
    dateIds: Array.from({ length: 1000 }, (_, index) => `date-${index}`),
    locationIds: Array.from({ length: 1000 }, (_, index) => `location-${index}`),
  };
  expect(() => calculateEventAgreement(excessive)).toThrow("AGREEMENT_COMPLEXITY_LIMIT");
});

it("does not mutate caller registrations, votes or option order", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  calculateEventAgreement(input);
  expect(JSON.stringify(input)).toBe(before);
});

it("fixed public date/location cannot make four weak game votes beat three YES votes", () => {
  const base = fixture(["a", "b", "c", "d"], 4);
  const input: EventAgreementInput = {
    ...base,
    fixedDateAndLocation: true,
    dateVotes: {},
    locationVotes: {},
    tables: [{ ...base.tables[0], gameIds: [1, 2] }],
    gameVotes: {
      t: {
        a: { "1": "YES", "2": "YES" },
        b: { "1": "YES", "2": "IF_NEEDED" },
        c: { "1": "YES", "2": "IF_NEEDED" },
        d: { "1": "NO", "2": "IF_NEEDED" },
      },
    },
  };
  const result = calculateEventAgreement(input);
  expect(result.agreed && result.includedTables[0].gameId).toBe(1);
  expect(result.agreed && result.participantIds).toEqual(["a", "b", "c"]);
});

it("does not repeat an agreement notification merely because the same players adjust YES to IF_NEEDED", () => {
  const input = fixture();
  const changed = game(input, "a", "IF_NEEDED");
  expect(calculateEventAgreement(input).situationKey).toBe(
    calculateEventAgreement(changed).situationKey,
  );
  const blocked = game(input, "a", "NO");
  expect(calculateEventAgreement(input).situationKey).not.toBe(
    calculateEventAgreement(blocked).situationKey,
  );
});

it("projects displaced and promoted players without stealing a pending seat", () => {
  const rows: AgreementRegistration[] = [
    {
      id: "a",
      tableId: "t",
      userId: "a",
      status: "ACCEPTED",
      priorityAt: "2030-01-01",
      sequence: 0,
    },
    {
      id: "b",
      tableId: "t",
      userId: "b",
      status: "PENDING",
      priorityAt: "2030-01-01",
      sequence: 1,
    },
    {
      id: "c",
      tableId: "t",
      userId: "c",
      status: "ACCEPTED",
      priorityAt: "2030-01-01",
      sequence: 2,
    },
    {
      id: "d",
      tableId: "t",
      userId: "d",
      status: "PENDING",
      priorityAt: "2030-01-01",
      sequence: 3,
    },
  ];
  expect(projectReservedPlaces(rows, 2)).toEqual(allocateReservedPlaces(rows, 2));
  const selected = projectReservedPlaces(rows, 2, ["c"]);
  expect(selected.seated.map((row) => row.id)).toEqual(["b", "c"]);
  expect(selected.waiting.map((row) => row.id)).toEqual(["a", "d"]);
});

it("keeps the blocked situation stable when additional invitations do not change its reason", () => {
  const input = game(fixture(), "a", "NO");
  const additional = {
    ...input,
    registrations: [
      ...input.registrations,
      {
        ...input.registrations[0],
        id: "wait",
        userId: "wait",
        sequence: 9,
        status: "PENDING" as const,
      },
    ],
  };
  expect(calculateEventAgreement(input).situationKey).toBe(
    calculateEventAgreement(additional).situationKey,
  );
});
