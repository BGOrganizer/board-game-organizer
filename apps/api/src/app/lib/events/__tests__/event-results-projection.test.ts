import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { personalEventProjection, personalTableProjection } from "../event-personal-projection";
import { sharedEventResults, sharedTableResults } from "../event-results-projection";

const at = "2030-06-04T20:00:00.000Z";
const location = (id: string) => ({
  id,
  name: id,
  address: "Verified venue",
  latitude: 41.9,
  longitude: 12.5,
  timeZone: "Europe/Rome",
});
function event(): PlannedEventResponse {
  return {
    id: "event",
    name: "Final event",
    adminUserId: "manager-not-attending",
    groupId: "SECRET-GROUP-ID",
    groupName: "SECRET-GROUP-NAME",
    groupType: "PRIVATE",
    visibility: "PRIVATE",
    shareResultsWithFriends: true,
    dates: [
      { id: "unselected-date", day: "2030-06-03" },
      { id: "selected-date", day: "2030-06-04" },
    ],
    locations: [location("unselected-venue"), location("selected-venue")],
    confirmed: { dateId: "selected-date", locationId: "selected-venue", at },
    timeZone: "Europe/Rome",
    startTime: "20:00",
    endsAt: at,
    bookingClosesAt: at,
    status: "TERMINATED",
    version: 10,
    planningGeneration: 3,
    createdAt: at,
    updatedAt: at,
    role: "admin",
    canManage: true,
    canEdit: true,
    canInvite: true,
    canRegister: true,
    canVote: true,
    canConfirm: true,
    canReplan: true,
    canFinalize: true,
    canProposeDates: true,
    canProposeLocations: true,
    allowParticipantDates: true,
    allowParticipantLocations: true,
    myRegistrations: [],
    myDemonstrator: true,
    myVotes: { dateVotes: {}, locationVotes: {} },
    voteCounts: { dates: {}, locations: {} },
    agreement: { agreed: true, tables: [], reasons: [] },
    tableCount: 99,
    participantCount: 99,
  };
}
function table(): PlannedTableResponse {
  return {
    id: "table",
    eventId: "event",
    name: "Final table",
    order: 0,
    minPlayers: 2,
    maxPlayers: 6,
    rankingEnabled: true,
    games: [{ gameId: 1 }, { gameId: 2 }],
    createdAt: at,
    updatedAt: at,
    confirmed: { gameId: 2, playerIds: ["a", "nd"], startsAt: at },
    results: {
      lowerWins: false,
      entries: [
        { userId: "a", score: "5", rank: 1 },
        { userId: "nd", score: null, rank: 2 },
      ],
      tieBreaks: [],
      finalizedAt: at,
    },
    resultDraft: { lowerWins: false, entries: [{ userId: "a", score: "4" }], tieBreaks: [] },
    adminUserId: "manager-not-attending",
    eventName: "Final event",
    eventVersion: 10,
    eventStatus: "TERMINATED",
    eventSchedule: {
      localStartsAt: at,
      location: location("selected-venue"),
      dateCount: 2,
      locationCount: 2,
      dates: [{ id: "SECRET-OPTION", localStartsAt: "2030-01-01T20:00" }],
      locations: [location("SECRET-unselected-venue")],
      timeZone: "Europe/Rome",
    },
    managementRole: "admin",
    groupId: "SECRET-GROUP-ID",
    groupName: "SECRET-GROUP-NAME",
    groupType: "PRIVATE",
    canManage: true,
    canProposeGames: true,
    canRegister: true,
    canRespond: true,
    canLeave: true,
    canInvite: true,
    myRegistration: null,
    myPosition: null,
    seatedCount: 2,
    pendingCount: 5,
    waitingCount: 8,
    acceptedCount: 10,
    pendingRegistrationCount: 5,
    allowParticipantGames: true,
    gameVoteCounts: {},
    gameVoteVoters: {
      "1": {
        YES: [{ userId: "SECRET-VOTER", name: null, username: null, avatarUrl: null }],
        IF_NEEDED: [],
        NO: [],
      },
    },
    demonstratorUserId: "PRIVATE-GROUP-DUTY",
    demonstratorName: "Private demonstrator",
    bookingClosesAt: at,
    gamesDetail: [1, 2].map((id) => ({ id, name: `Game ${id}`, imageUrl: null, year: null })),
    ratingChanges: [{ userId: "a", score: 1, delta: 2, provisional: false }],
    groupRatingChanges: [{ userId: "a", score: 999, delta: 99, provisional: false }],
    winners: [{ userId: "a", name: "Player a", avatarUrl: null }],
    resultProfiles: [
      {
        userId: "a",
        name: "Player a",
        username: "player-a",
        email: "PRIVATE-EMAIL",
        avatarUrl: null,
      },
    ],
  };
}

function registration(
  status: TableRegistration["status"],
  userId = "a",
  tableId = "table",
): TableRegistration {
  return {
    id: `${userId}-${tableId}`,
    userId,
    tableId,
    eventId: "event",
    kind: "INVITATION",
    status,
    priorityAt: at,
    sequence: 1,
    version: 1,
    gameVotes: { "2": "YES" },
    createdAt: at,
    updatedAt: at,
  };
}
it.each(["ACCEPTED", "PENDING", "DECLINED", "CANCELLED"] as const)(
  "retains factual personal frozen registration status, never foreign identities or cancelled waiting places: %s",
  (status) => {
    const source = table(),
      own = registration(status);
    const frozen = personalTableProjection(source, own, "a");
    expect(frozen).toMatchObject({
      personalAccessOnly: true,
      sharedResultsOnly: false,
      groupId: null,
      groupName: null,
      groupType: null,
      accessRevokedGroupId: source.groupId,
      myPosition: "FROZEN",
      myRegistration: { ...own, gameVotes: {} },
      canManage: false,
      canInvite: false,
      readOnly: true,
    });
    expect(frozen).not.toHaveProperty("groupRatingChanges");
    expect(frozen).not.toHaveProperty("resultDraft");
    expect(frozen).not.toHaveProperty("gameVoteVoters");
    expect(frozen.resultProfiles?.[0].email).toBeNull();
    const duty = { ...source, demonstratorUserId: "demo", demonstratorName: "Guide" };
    const waiting = personalTableProjection(duty, registration(status, "demo"), "demo");
    expect(waiting.myPosition).toBe(
      status === "ACCEPTED" || status === "PENDING" ? "WAITING" : null,
    );
    expect(waiting.myRegistration?.status ?? null).toBe(
      status === "ACCEPTED" || status === "PENDING" ? status : null,
    );
    expect(waiting.demonstratorName).toBe("Guide");
    expect(personalTableProjection(source, null, "a").myPosition).toBe("FROZEN");
    expect(
      personalTableProjection(source, registration(status, "other"), "a").myRegistration,
    ).toBeNull();
    expect(
      personalTableProjection(source, registration(status, "a", "other-table"), "a").myRegistration,
    ).toBeNull();
    expect(
      personalTableProjection(source, { ...own, eventId: "other-event" }, "a").myRegistration,
    ).toBeNull();
  },
);
it("restricts personal Event counts and mutable rows to its own frozen/demonstrated Tables, retaining only opaque cache revocation scope", () => {
  const source = { ...event(), shareResultsWithFriends: false };
  const own = table(),
    duty = {
      ...table(),
      id: "duty",
      demonstratorUserId: "a",
      confirmed: { gameId: 2, playerIds: ["b", "c"], startsAt: at },
    };
  const unrelated = {
    ...table(),
    id: "unrelated",
    confirmed: { gameId: 2, playerIds: ["x", "y"], startsAt: at },
  };
  const rows = [
    registration("CANCELLED"),
    registration("CANCELLED", "a", "duty"),
    registration("PENDING", "foreign"),
    registration("ACCEPTED", "a", "unrelated"),
    { ...registration("ACCEPTED"), eventId: "foreign-event" },
  ];
  const foreign = { ...own, id: "foreign-table", eventId: "foreign-event" };
  const result = personalEventProjection(source, [own, duty, unrelated, foreign], rows, "a");
  expect(result).toMatchObject({
    role: "participant",
    personalAccessOnly: true,
    readOnly: true,
    shareResultsWithFriends: false,
    tableCount: 2,
    participantCount: 4,
    myDemonstrator: true,
    groupId: null,
    groupName: null,
    groupType: null,
    accessRevokedGroupId: source.groupId,
  });
  expect(result.myRegistrations).toEqual([{ ...rows[0], gameVotes: {}, position: "FROZEN" }]);
  expect(result).not.toHaveProperty("myVotes");
  expect(result).not.toHaveProperty("voteCounts");
  expect(result).not.toHaveProperty("agreement");
  const { accessRevokedGroupId: scope, ...visible } = result;
  expect(scope).toBe(source.groupId);
  expect(JSON.stringify(visible)).not.toMatch(/SECRET|unselected|foreign/);
  const demo = personalEventProjection(
    source,
    [duty],
    [registration("ACCEPTED", "a", "duty")],
    "a",
  );
  expect(demo).toMatchObject({
    role: "demonstrator",
    myRegistrations: [{ position: "WAITING", status: "ACCEPTED" }],
  });
  expect(
    personalEventProjection(source, [duty], [registration("PENDING", "a", "duty")], "a")
      .myRegistrations[0].status,
  ).toBe("PENDING");
  expect(personalEventProjection(source, [], [], "a")).toMatchObject({
    role: "viewer",
    myDemonstrator: false,
    participantCount: 0,
    tableCount: 0,
  });
  expect(personalEventProjection({ ...source, groupId: null }, [own], [], "a")).toMatchObject({
    role: "participant",
    myDemonstrator: false,
    accessRevokedGroupId: undefined,
  });
  expect(
    personalTableProjection({ ...own, groupId: null }, null, "a").accessRevokedGroupId,
  ).toBeUndefined();
  expect(
    personalTableProjection({ ...own, confirmed: undefined }, null, "a").myPosition,
  ).toBeNull();
});
it("shares only selected Event information and final physical rosters, never Group metadata, ballots, drafts or queue counts", () => {
  const source = Object.assign(event(), {
    futurePrivateField: "PRIVATE-ROOT",
    managementRole: "admin" as const,
  });
  const one = table(),
    two = {
      ...table(),
      id: "second",
      confirmed: { ...table().confirmed!, playerIds: ["nd", "c"] },
    };
  const excluded = { ...table(), id: "excluded", confirmed: undefined };
  const provisional = { ...table(), id: "provisional", results: undefined };
  const before = structuredClone(source);
  const result = sharedEventResults(source, [one, two, excluded, provisional]);
  expect(result).toMatchObject({
    role: "viewer",
    readOnly: true,
    sharedResultsOnly: true,
    groupId: null,
    groupName: null,
    groupType: null,
    tableCount: 2,
    participantCount: 3,
  });
  expect(result.dates).toEqual([source.dates[1]]);
  expect(result.locations).toEqual([source.locations[1]]);
  for (const key of [
    "canManage",
    "canEdit",
    "canRegister",
    "canInvite",
    "canVote",
    "canConfirm",
    "canReplan",
    "canFinalize",
    "canProposeDates",
    "canProposeLocations",
  ])
    expect(result[key as keyof typeof result]).toBe(false);
  for (const key of [
    "agreement",
    "voteCounts",
    "myVotes",
    "clientRequestId",
    "bookingClosesAt",
    "allowParticipantDates",
    "allowParticipantLocations",
    "managementRole",
    "futurePrivateField",
  ])
    expect(result).not.toHaveProperty(key);
  expect(result.myRegistrations).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE-ROOT|unselected/);
  expect(source).toEqual(before);
});

it("allowlists selected Table/result metadata and GLOBAL deltas, deeply removes private profile fields without mutating source", () => {
  const source = {
    ...table(),
    demonstratorUserId: undefined,
    demonstratorGuestName: "PRIVATE-GUEST",
    demonstratorName: "PRIVATE-GUEST",
    futurePrivateField: "PRIVATE-ROOT",
  };
  Object.assign(source.resultProfiles![0], { phone: "PRIVATE-PHONE" });
  const before = structuredClone(source);
  const result = sharedTableResults(source);
  expect(result).toMatchObject({
    groupId: null,
    groupName: null,
    groupType: null,
    sharedResultsOnly: true,
    readOnly: true,
    canManage: false,
    canRegister: false,
    canRespond: false,
    canLeave: false,
    canInvite: false,
    canProposeGames: false,
    pendingCount: 0,
    pendingRegistrationCount: 0,
    waitingCount: 0,
    acceptedCount: 2,
    seatedCount: 2,
  });
  expect(result.games).toEqual([{ gameId: 2 }]);
  expect(result.gamesDetail.map((game) => game.id)).toEqual([2]);
  expect(result.results).toEqual(source.results);
  expect(result.confirmed?.playerIds).toEqual(["a", "nd"]);
  expect(result.eventSchedule).toMatchObject({ dateCount: 1, locationCount: 1 });
  expect(result.eventSchedule).not.toHaveProperty("dates");
  expect(result.eventSchedule).not.toHaveProperty("locations");
  expect(result).not.toHaveProperty("managementRole");
  expect(result.ratingChanges).toEqual(source.ratingChanges);
  expect(result.resultProfiles).toEqual([
    { userId: "a", name: "Player a", username: "player-a", avatarUrl: null, email: null },
  ]);
  for (const key of [
    "groupRatingChanges",
    "resultDraft",
    "demonstratorUserId",
    "demonstratorGuestName",
    "demonstratorName",
    "bookingClosesAt",
    "gameVoteCounts",
    "gameVoteVoters",
    "allowParticipantGames",
    "futurePrivateField",
  ])
    expect(result).not.toHaveProperty(key);
  expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE-|999/);
  expect(source).toEqual(before);
});

it("keeps the guest display label in personal frozen Table access without granting duty", () => {
  const current = {
    ...table(),
    demonstratorUserId: undefined,
    demonstratorGuestName: "Arianna",
    demonstratorName: "Arianna",
    demonstratorAvatarUrl: null,
  };
  const result = personalTableProjection(current, registration("ACCEPTED"), "a");
  expect(result).toMatchObject({
    personalAccessOnly: true,
    demonstratorGuestName: "Arianna",
    demonstratorName: "Arianna",
    demonstratorAvatarUrl: null,
  });
  expect(result.demonstratorUserId).toBeUndefined();
});

it("never fabricates missing historical detail fields, profiles or roster membership", () => {
  const source = {
    ...table(),
    eventSchedule: undefined,
    resultProfiles: undefined,
    confirmed: undefined,
  };
  const result = sharedTableResults(source);
  expect(result.eventSchedule).toBeUndefined();
  expect(result.resultProfiles).toBeUndefined();
  expect(result.games).toEqual([]);
  expect(result.gamesDetail).toEqual([]);
  expect(result.acceptedCount).toBe(0);
  expect(result.seatedCount).toBe(0);
  expect(sharedEventResults({ ...event(), confirmed: undefined }, []).dates).toEqual([]);
});

it("redacts sibling card summaries and restores only factual frozen personal attendance", () => {
  const source = event(),
    own = table();
  const duty = {
    ...table(),
    id: "duty",
    demonstratorUserId: "a",
    confirmed: { ...table().confirmed!, playerIds: ["b", "c"] },
  };
  const privateSibling = {
    ...table(),
    id: "private-sibling",
    name: "PRIVATE-SIBLING",
    confirmed: undefined,
  };
  const summary = (row: typeof own) => ({
    tableId: row.id,
    name: row.name,
    confirmed: Boolean(row.confirmed),
    ready: Boolean(row.confirmed),
    blockers: [] as const,
    myParticipation: "NONE" as const,
    exclusionReasons: [] as const,
    winners: [{ userId: "a", username: "player-a" }],
  });
  source.cardSummary = {
    ready: true,
    tables: [own, duty, privateSibling].map((row) => ({
      ...summary(row),
      blockers: [],
      exclusionReasons: [],
    })),
  };
  const personal = personalEventProjection(source, [own, duty, privateSibling], [], "a");
  expect(personal.cardSummary?.tables.map((row) => [row.tableId, row.myParticipation])).toEqual([
    ["table", "CONFIRMED"],
    ["duty", "NONE"],
  ]);
  expect(JSON.stringify(personal)).not.toContain("PRIVATE-SIBLING");
  expect(sharedEventResults(source, [own]).cardSummary?.tables).toEqual([
    { ...summary(own), blockers: [], exclusionReasons: [] },
  ]);
  expect(sharedEventResults(source, []).cardSummary?.tables).toEqual([]);
  expect(personalEventProjection(source, [], [], "a").cardSummary?.tables).toEqual([]);
});

it("clears personal card markers for shared viewers without losing authoritative personal Table snapshots", () => {
  const source = table();
  source.cardSummary = {
    tableId: source.id,
    name: source.name,
    confirmed: true,
    ready: true,
    blockers: [],
    myParticipation: "EXCLUDED",
    exclusionReasons: ["NOT_SELECTED"],
    winners: [{ userId: "a", username: "player-a" }],
  };
  expect(sharedTableResults(source).cardSummary).toMatchObject({
    myParticipation: "NONE",
    exclusionReasons: [],
  });
  expect(personalTableProjection(source, null, "a").cardSummary).toMatchObject({
    myParticipation: "CONFIRMED",
    exclusionReasons: [],
  });
  const duty = { ...source, demonstratorUserId: "demo" };
  expect(
    personalTableProjection(duty, registration("ACCEPTED", "demo"), "demo").cardSummary,
  ).toMatchObject({ myParticipation: "EXCLUDED", exclusionReasons: ["NOT_SELECTED"] });
  expect(personalTableProjection(duty, null, "demo").cardSummary).toMatchObject({
    myParticipation: "NONE",
    exclusionReasons: [],
  });
});

it("preserves exclusion precedence for a personal frozen demonstrator's own accepted/pending registration", () => {
  const source = event(),
    duty = { ...table(), demonstratorUserId: "demo" };
  duty.cardSummary = {
    tableId: duty.id,
    name: duty.name,
    confirmed: true,
    ready: true,
    blockers: [],
    myParticipation: "NONE",
    exclusionReasons: [],
    winners: [],
  };
  source.cardSummary = { ready: true, tables: [duty.cardSummary] };
  for (const status of ["ACCEPTED", "PENDING", "CANCELLED"] as const) {
    const own = registration(status, "demo");
    const expected =
      status === "CANCELLED"
        ? []
        : status === "PENDING"
          ? ["PENDING_INVITATION"]
          : ["NOT_SELECTED"];
    const rows = [
      { ...own, userId: "foreign" },
      { ...own, eventId: "foreign" },
      { ...own, tableId: "foreign" },
      own,
    ];
    const result = personalEventProjection(source, [duty], rows, "demo");
    expect(result.cardSummary?.tables[0]).toMatchObject({
      myParticipation: status === "CANCELLED" ? "NONE" : "EXCLUDED",
      exclusionReasons: expected,
    });
    expect(personalTableProjection(duty, own, "demo").cardSummary?.exclusionReasons).toEqual(
      expected,
    );
  }
});
