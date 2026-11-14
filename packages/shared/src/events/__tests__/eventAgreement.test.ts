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
    dateIds: ["d", "d-other"],
    locationIds: ["l", "l-other"],
    fixedDateAndLocation: false,
    tables: [{ id: "t", minPlayers: 2, maxPlayers: max, gameIds: [1, 99], fixedGame: false }],
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

it("counts people instead of the last locked slot and preserves sparse Manual allocations", () => {
  const input = fixture(["a", "b", "c"], 4);
  input.planningMode = "MANUAL";
  input.registrations = input.registrations.map((row, index) => ({
    ...row,
    seatIndex: [0, null, 3][index],
    locked: index === 2,
  }));
  const plan = calculateEventAgreement(input);
  expect(plan.agreed && plan.participantIds).toEqual(["a", "c"]);
  expect(
    projectReservedPlaces(input.registrations, 4, ["a", "c"]).seated.map((row) => row.seatIndex),
  ).toEqual([0, 3]);
  input.planningMode = "ASSISTED";
  input.tables[0].preserveSeatAllocation = true;
  const override = calculateEventAgreement(input);
  expect(override.agreed && override.participantIds).toEqual(["a", "c"]);
  input.tables[0].preserveSeatAllocation = false;
  const later = calculateEventAgreement(input);
  expect(later.agreed && later.participantIds).toEqual(["a", "b", "c"]);
});

it("projects sparse Assisted choices around locked and pending anchors, queuing displaced users", () => {
  const input = fixture(["a", "b", "c", "d"], 4);
  const rows = input.registrations.map((row, index) => ({
    ...row,
    seatIndex: [2, 0, null, 1][index],
    locked: index === 1,
    status: index === 3 ? ("PENDING" as const) : ("ACCEPTED" as const),
  }));
  const projected = projectReservedPlaces(rows, 4, ["b", "c"], false);
  expect(projected.seated.map((row) => [row.id, row.seatIndex])).toEqual([
    ["b", 0],
    ["c", 1],
    ["d", 3],
  ]);
  expect(projected.waiting.map((row) => [row.id, row.seatIndex])).toEqual([["a", null]]);
  const full = projectReservedPlaces(rows, 4, ["a", "b", "c"], false);
  expect(full.seated.map((row) => row.seatIndex)).toEqual([0, 1, 2, 3]);
  expect(projectReservedPlaces(rows, 4, ["a", "c"], false).seated.some((row) => row.locked)).toBe(
    true,
  );
});

describe("verified per-game player bounds", () => {
  it.each([
    { minPlayers: 3, maxPlayers: 6 },
    { minPlayers: 1, maxPlayers: 1 },
  ])(
    "never confirms a game outside its playable count even when Table minimum alone is met: %j",
    (bounds) => {
      const input = fixture();
      input.tables[0].gamePlayerBounds = { 1: bounds };
      expect(calculateEventAgreement(input).agreed).toBe(false);
    },
  );
  it("chooses the playable option, never drops seated consenting players to fit a smaller game", () => {
    const input = fixture(["a", "b", "c", "d", "e"], 6);
    input.tables[0].gamePlayerBounds = {
      1: { minPlayers: 2, maxPlayers: 4 },
      99: { minPlayers: 3, maxPlayers: 6 },
    };
    input.gameVotes = {
      t: Object.fromEntries(
        input.registrations.map((row) => [row.userId, { "1": "YES", "99": "IF_NEEDED" }]),
      ),
    };
    const result = calculateEventAgreement(input);
    expect(result.agreed && result.includedTables[0]).toMatchObject({
      gameId: 99,
      participantIds: ["a", "b", "c", "d", "e"],
    });
  });
  it("fills a real game minimum from compatible accepted queue priority without stealing pending reservations", () => {
    let input = fixture(["a", "b", "c", "d", "e"], 3);
    input = votes(votes(input, "dateVotes", "b", "NO"), "dateVotes", "c", "NO");
    input.tables[0].gamePlayerBounds = { 1: { minPlayers: 3, maxPlayers: 3 } };
    const result = calculateEventAgreement(input);
    expect(result.agreed && result.includedTables[0]).toMatchObject({
      participantIds: ["a", "d", "e"],
    });
    expect(calculateEventAgreement(pending(input, "b")).agreed).toBe(false);
  });
});

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
  it("never manufactures multiple-game preferences from a historical fixed-game hint", () => {
    const input = fixture();
    input.tables[0].fixedGame = true;
    input.gameVotes = {};
    expect(calculateEventAgreement(input).agreed).toBe(false);
    input.gameVotes = { t: { a: { "1": "YES" }, b: { "1": "IF_NEEDED" } } };
    const result = calculateEventAgreement(input);
    expect(result.agreed).toBe(true);
    expect(result.agreed && result.yesGameVotes).toBe(1);
  });
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
    "a singleton game is accepted by seating, not blocked by a historical %s preference",
    (vote) => {
      const input = fixture();
      input.tables = [{ ...input.tables[0], gameIds: [1], fixedGame: true }];
      const result = calculateEventAgreement(game(input, "b", vote));
      expect(result.agreed).toBe(true);
      expect(result.agreed && result.yesGameVotes).toBe(0);
    },
  );
  it("fixed public options establish accepted-only eligibility without inventing preference totals", () => {
    const input = {
      ...fixture(),
      dateIds: ["d"],
      locationIds: ["l"],
      fixedDateAndLocation: true,
      tables: [{ ...fixture().tables[0], gameIds: [1], fixedGame: true }],
      dateVotes: {},
      locationVotes: {},
      gameVotes: {},
    };
    const result = calculateEventAgreement(input);
    expect(result.agreed && result.yesGameVotes).toBe(0);
    // Fixed choices establish eligibility, not preference votes that bias attendance.
    expect(result.agreed && result.yesDateLocationVotes).toBe(0);
    expect(calculateEventAgreement(pending(input, "a")).agreed).toBe(false);
  });
});

it.each(
  Array.from(
    { length: 8 },
    (_, bits) => [Boolean(bits & 1), Boolean(bits & 2), Boolean(bits & 4)] as const,
  ),
)(
  "handles singleton/multiple date=%s location=%s game=%s independently, without synthetic preferences",
  (dates, locations, games) => {
    const input = fixture();
    input.dateIds = dates ? ["d", "d-other"] : ["d"];
    input.locationIds = locations ? ["l", "l-other"] : ["l"];
    input.tables = [{ ...input.tables[0], gameIds: games ? [1, 99] : [1] }];
    input.dateVotes = dates ? { a: { d: "YES" }, b: { d: "YES" } } : {};
    input.locationVotes = locations ? { a: { l: "YES" }, b: { l: "YES" } } : {};
    input.gameVotes = games ? { t: { a: { "1": "YES" }, b: { "1": "YES" } } } : {};
    const result = calculateEventAgreement(input);
    expect(result.agreed).toBe(true);
    expect(result.agreed && result.includedTables[0].participantIds).toEqual(["a", "b"]);
    expect(result.agreed && result.yesDateLocationVotes).toBe(
      Number(dates) * 2 + Number(locations) * 2,
    );
    expect(result.agreed && result.yesGameVotes).toBe(games ? 2 : 0);
    expect(calculateEventAgreement(pending(input, "b")).agreed).toBe(false);
    if (dates)
      expect(calculateEventAgreement(votes(input, "dateVotes", "b", "NO")).agreed).toBe(false);
    if (locations)
      expect(calculateEventAgreement(votes(input, "locationVotes", "b", "NO")).agreed).toBe(false);
    if (games) expect(calculateEventAgreement(game(input, "b", "NO")).agreed).toBe(false);
  },
);

it("maximizes attendance before YES preferences", () => {
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
  expect(result.agreed && result.dateId).toBe("earlier");
  expect(result.agreed && result.participantIds).toEqual(["a", "b", "c", "d"]);
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

it("blocks every table whose seated players disagree instead of confirming subsets", () => {
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
  expect(result.agreed).toBe(false);
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

it("fixed public options preserve all four seated players despite weaker preferences", () => {
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
  expect(result.agreed && result.includedTables[0].gameId).toBe(2);
  expect(result.agreed && result.participantIds).toEqual(["a", "b", "c", "d"]);
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
  expect(selected.seated.map((row) => row.id)).toEqual(["c", "b"]);
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

it("Manual never replaces date-incompatible seated players with accepted waiters", () => {
  const input = fixture(["a", "b", "c"], 2);
  input.planningMode = "MANUAL";
  input.dateIds = ["d", "other"];
  input.dateVotes = { a: { d: "YES" }, b: { d: "NO" }, c: { d: "YES" } };
  expect(calculateEventAgreement(input).agreed).toBe(false);
  input.planningMode = "ASSISTED";
  expect(calculateEventAgreement(input).agreed).toBe(true);
});
it("does not drop a seated game dissenter even when a consenting seated subset reaches minimum", () => {
  const input = fixture(["a", "b", "c"], 3);
  input.tables = [{ ...input.tables[0], minPlayers: 2, gameIds: [1, 2] }];
  input.gameVotes = {
    t: { a: { 1: "YES", 2: "NO" }, b: { 1: "YES", 2: "NO" }, c: { 1: "NO", 2: "YES" } },
  };
  expect(calculateEventAgreement(input).agreed).toBe(false);
});
it("Best reduces only with explicit Assisted reduction and preserves locked users", () => {
  const input = fixture(["a", "b", "c"], 3);
  input.tables = [
    {
      ...input.tables[0],
      minPlayers: 2,
      gamePolls: {
        1: {
          totalVotes: 10,
          fetchedAt: "2026-11-11T00:00:00Z",
          rows: [
            {
              players: 2,
              orMore: false,
              best: 10,
              recommended: 0,
              notRecommended: 0,
              sampleCount: 10,
            },
            {
              players: 3,
              orMore: false,
              best: 0,
              recommended: 10,
              notRecommended: 0,
              sampleCount: 10,
            },
          ],
        },
      },
    },
  ];
  input.playerPreference = "BEST";
  let result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds.length).toBe(3);
  input.allowBestReduction = true;
  input.registrations = input.registrations.map((row) => ({ ...row, locked: row.userId === "c" }));
  result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds).toEqual(["a", "b", "c"]);
  input.registrations = input.registrations.map((row) => ({ ...row, locked: row.userId === "a" }));
  result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds).toEqual(["a", "b"]);
  input.planningMode = "MANUAL";
  result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds.length).toBe(3);
});

it("cannot replace a locked date-incompatible player with a compatible waiting player", () => {
  const input = votes(fixture(["a", "b", "c"], 2), "dateVotes", "b", "NO");
  input.registrations = input.registrations.map((row) => ({ ...row, locked: row.userId === "b" }));
  expect(calculateEventAgreement(input).agreed).toBe(false);
});
it("does not reduce an all-locked group or fabricate Best recommendations from missing polls", () => {
  const input = fixture(["a", "b", "c", "d"], 4);
  input.playerPreference = "BEST";
  input.allowBestReduction = true;
  input.registrations = input.registrations.map((row) => ({ ...row, locked: true }));
  input.tables = [
    {
      ...input.tables[0],
      gamePolls: {
        1: {
          totalVotes: 1,
          fetchedAt: "2026-11-11T00:00:00Z",
          rows: [
            {
              players: 2,
              orMore: false,
              best: 1,
              recommended: 0,
              notRecommended: 0,
              sampleCount: 1,
            },
          ],
        },
      },
    },
  ];
  let result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds.length).toBe(4);
  input.tables = [{ ...input.tables[0], gamePolls: undefined }];
  result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds.length).toBe(4);
});
it("explicit Best reduction can fit a smaller game but never below its hard minimum", () => {
  const input = fixture(["a", "b", "c"], 3);
  input.playerPreference = "BEST";
  input.allowBestReduction = true;
  input.tables = [
    {
      ...input.tables[0],
      gameIds: [1],
      gamePlayerBounds: { 1: { minPlayers: 2, maxPlayers: 2 } },
      gamePolls: {
        1: {
          totalVotes: 1,
          fetchedAt: "2026-11-11T00:00:00Z",
          rows: [
            {
              players: 2,
              orMore: false,
              best: 1,
              recommended: 0,
              notRecommended: 0,
              sampleCount: 1,
            },
          ],
        },
      },
    },
  ];
  let result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds.length).toBe(2);
  input.tables = [
    { ...input.tables[0], gamePlayerBounds: { 1: { minPlayers: 3, maxPlayers: 3 } } },
  ];
  result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds.length).toBe(3);
});
it("uses BGG quality before YES preference when attendance ties and preserves exact joint search", () => {
  const input = fixture();
  const poll = (best: number, recommended: number) => ({
    totalVotes: 3,
    fetchedAt: "2026-11-11T00:00:00Z",
    rows: [
      {
        players: 2,
        orMore: false,
        best,
        recommended,
        notRecommended: 0,
        sampleCount: best + recommended,
      },
    ],
  });
  input.tables = input.tables.map((table) => ({
    ...table,
    gameIds: [1, 2],
    gamePolls: { 1: poll(0, 3), 2: poll(3, 0) },
  }));
  input.gameVotes = { t: { a: { 1: "YES", 2: "IF_NEEDED" }, b: { 1: "YES", 2: "IF_NEEDED" } } };
  const result = calculateEventAgreement(input);
  expect(result.agreed && result.includedTables[0].gameId).toBe(2);
});

it("uses verified BGG quality for the first eligible waiting-prefix allocation", () => {
  const input = votes(fixture(["a", "b", "c"], 2), "dateVotes", "b", "NO");
  input.tables = input.tables.map((table) => ({
    ...table,
    gamePolls: {
      1: {
        totalVotes: 1,
        fetchedAt: "2026-11-11T00:00:00Z",
        rows: [
          { players: 2, orMore: false, best: 1, recommended: 0, notRecommended: 0, sampleCount: 1 },
        ],
      },
    },
  }));
  const result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds).toEqual(["a", "c"]);
});

it("does not invent a Best reduction when hard bounds require a smaller group but poll data is unknown", () => {
  const input = fixture(["a", "b", "c"], 3);
  input.playerPreference = "BEST";
  input.allowBestReduction = true;
  input.tables = [
    { ...input.tables[0], gameIds: [1], gamePlayerBounds: { 1: { minPlayers: 2, maxPlayers: 2 } } },
  ];
  const result = calculateEventAgreement(input);
  expect(result.agreed).toBe(false);
  expect(result.tables[0]).toMatchObject({ phase: "BLOCKED", reason: "NO_COMPATIBLE_PLAYERS" });
});

it("Manual retains the saved seat boundary and promotes the first queue entry after departure", () => {
  const input = fixture(["a", "b", "c", "d"], 4);
  input.planningMode = "MANUAL";
  input.tables = [{ ...input.tables[0], seatedCapacity: 2 }];
  let result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds).toEqual(["a", "b"]);
  expect(result.agreed && result.includedTables[0].waitingIds).toEqual(["c", "d"]);
  input.registrations = input.registrations.filter((row) => row.userId !== "a");
  result = calculateEventAgreement(input);
  expect(result.agreed && result.participantIds).toEqual(["b", "c"]);
});

it("Best and Recommended rank ahead of weaker classifications before YES preferences", () => {
  const input = fixture();
  input.playerPreference = "BEST";
  const poll = (best: number, recommended: number, no: number) => ({
    totalVotes: 5,
    fetchedAt: "2026-11-11T00:00:00Z",
    rows: [
      {
        players: 2,
        orMore: false,
        best,
        recommended,
        notRecommended: no,
        sampleCount: best + recommended + no,
      },
    ],
  });
  input.tables = input.tables.map((table) => ({
    ...table,
    gameIds: [1, 2],
    gamePolls: { 1: poll(0, 0, 5), 2: poll(0, 5, 0) },
  }));
  input.gameVotes = { t: { a: { 1: "YES", 2: "IF_NEEDED" }, b: { 1: "YES", 2: "IF_NEEDED" } } };
  let result = calculateEventAgreement(input);
  expect(result.agreed && result.includedTables[0].gameId).toBe(2);
  input.tables = input.tables.map((table) => ({
    ...table,
    gamePolls: { 1: poll(5, 0, 0), 2: poll(0, 5, 0) },
  }));
  result = calculateEventAgreement(input);
  expect(result.agreed && result.includedTables[0].gameId).toBe(1);
});

it("one Best configuration dominates two merely Recommended configurations across a common Event date", () => {
  const input = fixture(["a", "b", "c"], 3);
  input.playerPreference = "BEST";
  input.locationIds = ["l"];
  const poll = (first: number, bestFirst: boolean) => ({
    totalVotes: 10,
    fetchedAt: "2026-11-11T00:00:00Z",
    rows: [
      {
        players: first,
        orMore: false,
        best: bestFirst ? 10 : 0,
        recommended: bestFirst ? 0 : 10,
        notRecommended: 0,
        sampleCount: 10,
      },
      {
        players: first === 3 ? 2 : 3,
        orMore: false,
        best: 0,
        recommended: first === 3 ? 10 : 0,
        notRecommended: first === 3 ? 0 : 10,
        sampleCount: 10,
      },
    ],
  });
  input.tables = [
    { ...input.tables[0], gameIds: [1], gamePolls: { 1: poll(3, true) } },
    { ...input.tables[0], id: "u", gameIds: [1], gamePolls: { 1: poll(3, false) } },
  ];
  input.registrations = [
    ...input.registrations,
    ...input.registrations.map((row, index) => ({
      ...row,
      id: "u-" + row.id,
      tableId: "u",
      userId: ["d", "e", "f"][index],
    })),
  ];
  input.dateVotes = {
    a: { d: "YES", "d-other": "YES" },
    b: { d: "YES", "d-other": "YES" },
    c: { d: "YES", "d-other": "NO" },
    d: { d: "YES", "d-other": "YES" },
    e: { d: "YES", "d-other": "YES" },
    f: { d: "NO", "d-other": "YES" },
  };
  input.gameVotes = {};
  const result = calculateEventAgreement(input);
  expect(result.agreed && result.dateId).toBe("d");
  expect(result.agreed && result.participantIds.length).toBe(5);
});

it("bounds Best reduction candidate preparation before allocating quadratic roster subsets", () => {
  const input = fixture(
    Array.from({ length: 1001 }, (_, index) => "user" + index),
    1001,
  );
  input.playerPreference = "BEST";
  input.allowBestReduction = true;
  expect(() => calculateEventAgreement(input)).toThrow("AGREEMENT_COMPLEXITY_LIMIT");
});

it.each([0, 1, 2])(
  "anchors the exact locked slot %i during projection and compacts it only after departure",
  (index) => {
    const input = fixture(["a", "b", "c", "d"], 3);
    input.registrations[index].locked = true;
    const locked = input.registrations[index];
    const selected = input.registrations
      .filter((row) => row.userId !== "a" || index === 0)
      .map((row) => row.userId);
    const projection = projectReservedPlaces(input.registrations, 3, selected);
    expect(projection.seated[index].id).toBe(locked.id);
    if (index > 0) {
      const departed = input.registrations.filter((row) => row.userId !== "a");
      expect(projectReservedPlaces(departed, 3).seated[index - 1].id).toBe(locked.id);
    }
  },
);
it("rejects an automated reduction that would leave the last locked ordinal outside the boundary", () => {
  const input = fixture(["a", "b", "c"], 3);
  input.registrations[2].locked = true;
  expect(
    projectReservedPlaces(input.registrations, 3, ["a", "c"]).seated.map((row) => row.id),
  ).toEqual(["a", "b", "c"]);
});
it("anchors a compatible locked slot when replacing an incompatible seated player from the queue", () => {
  let input = fixture(["a", "b", "c", "d"], 3);
  input.tables[0].minPlayers = 3;
  input.registrations[2].locked = true;
  input = votes(input, "dateVotes", "a", "NO");
  const result = calculateEventAgreement(input);
  expect(result.agreed).toBe(true);
  if (!result.agreed) return;
  const projected = projectReservedPlaces(
    input.registrations,
    3,
    result.includedTables[0].participantIds,
  );
  expect(projected.seated.map((row) => row.id)).toEqual(["b", "d", "c"]);
});
