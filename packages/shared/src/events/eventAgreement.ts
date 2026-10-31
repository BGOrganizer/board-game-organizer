export type AgreementVote = "UNKNOWN" | "YES" | "NO" | "IF_NEEDED";
export type AgreementVotes = Readonly<Record<string, Readonly<Record<string, AgreementVote>>>>;
export interface AgreementRegistration {
  id: string;
  tableId: string;
  userId: string;
  status: "PENDING" | "ACCEPTED";
  priorityAt: string;
  sequence: number;
}
export interface AgreementTable {
  id: string;
  minPlayers: number;
  maxPlayers: number;
  gameIds: readonly number[];
  fixedGame: boolean;
}
export interface EventAgreementInput {
  dateIds: readonly string[];
  locationIds: readonly string[];
  fixedDateAndLocation: boolean;
  tables: readonly AgreementTable[];
  registrations: readonly AgreementRegistration[];
  dateVotes: AgreementVotes;
  locationVotes: AgreementVotes;
  gameVotes: Readonly<Record<string, AgreementVotes>>;
}
export interface TableAgreement {
  tableId: string;
  gameId: number;
  participantIds: string[];
  waitingIds: string[];
}
export interface TableAgreementState {
  tableId: string;
  phase: "SEATED" | "WAITING" | "BLOCKED";
  reason: "PENDING_RESERVATIONS" | "GAME_DISAGREEMENT" | "NO_COMPATIBLE_PLAYERS" | null;
  pendingReservedIds: string[];
  initialSeatedIds: string[];
  consideredWaitingIds: string[];
}
export type EventAgreement = {
  tables: TableAgreementState[];
  situationKey: string;
} & (
  | { agreed: false }
  | {
      agreed: true;
      dateId: string;
      locationId: string;
      includedTables: TableAgreement[];
      participantIds: string[];
      yesDateLocationVotes: number;
      yesGameVotes: number;
    }
);

function priority(a: AgreementRegistration, b: AgreementRegistration): number {
  return (
    Date.parse(a.priorityAt) - Date.parse(b.priorityAt) ||
    a.sequence - b.sequence ||
    a.id.localeCompare(b.id)
  );
}

/** Pending invitations reserve capacity and queue priority, but never become voters. */
export function allocateReservedPlaces(
  registrations: readonly AgreementRegistration[],
  capacity: number,
) {
  const ordered = [...registrations].sort(priority);
  return { seated: ordered.slice(0, capacity), waiting: ordered.slice(capacity) };
}

const positive = (vote: AgreementVote | undefined) => vote === "YES" || vote === "IF_NEEDED";
interface Candidate {
  dateIndex: number;
  locationIndex: number;
  gameIndex: number;
  gameId: number;
  people: AgreementRegistration[];
  gameYes: number;
}
interface Prepared {
  table: AgreementTable;
  accepted: AgreementRegistration[];
  candidates: Candidate[];
  state: TableAgreementState;
}

function prepare(input: EventAgreementInput, table: AgreementTable): Prepared {
  const rows = input.registrations.filter((row) => row.tableId === table.id);
  const { seated, waiting } = allocateReservedPlaces(rows, table.maxPlayers);
  const pending = seated.filter((row) => row.status === "PENDING");
  const accepted = seated.filter((row) => row.status === "ACCEPTED");
  const queued = waiting.filter((row) => row.status === "ACCEPTED");
  const capacity = table.maxPlayers - pending.length;
  const state: TableAgreementState = {
    tableId: table.id,
    phase: "BLOCKED",
    reason: "NO_COMPATIBLE_PLAYERS",
    pendingReservedIds: pending.map((row) => row.userId),
    initialSeatedIds: accepted.map((row) => row.userId),
    consideredWaitingIds: [],
  };
  const result: Prepared = { table, accepted: [...accepted, ...queued], candidates: [], state };
  if (capacity < table.minPlayers) {
    state.reason = "PENDING_RESERVATIONS";
    return result;
  }
  const dateLocation = (row: AgreementRegistration, d: string, l: string) =>
    input.fixedDateAndLocation ||
    (positive(input.dateVotes[row.userId]?.[d]) && positive(input.locationVotes[row.userId]?.[l]));
  const gameVote = (row: AgreementRegistration, game: number): AgreementVote | undefined =>
    input.gameVotes[table.id]?.[row.userId]?.[String(game)] ??
    (table.fixedGame ? "YES" : undefined);
  let seatedDateLocation = false;
  const options: Array<Candidate & { firstPrefix: number; waiting: AgreementRegistration[] }> = [];
  for (const [dateIndex, date] of input.dateIds.entries()) {
    for (const [locationIndex, location] of input.locationIds.entries()) {
      const base = accepted.filter((row) => dateLocation(row, date, location));
      if (base.length >= table.minPlayers) seatedDateLocation = true;
      for (const [gameIndex, gameId] of table.gameIds.entries()) {
        const people = base.filter((row) => positive(gameVote(row, gameId)));
        const eligibleWaiting = queued.filter(
          (row) => dateLocation(row, date, location) && positive(gameVote(row, gameId)),
        );
        const missing = Math.max(0, table.minPlayers - people.length);
        const firstPrefix =
          missing === 0
            ? 0
            : eligibleWaiting.length < missing
              ? Infinity
              : queued.indexOf(eligibleWaiting[missing - 1]) + 1;
        options.push({
          dateIndex,
          locationIndex,
          gameIndex,
          gameId,
          people,
          gameYes: 0,
          firstPrefix,
          waiting: eligibleWaiting,
        });
      }
    }
  }
  const seatedOptions = options.filter((option) => option.firstPrefix === 0);
  if (seatedOptions.length > 0) {
    state.phase = "SEATED";
    state.reason = null;
    result.candidates = seatedOptions.map((option) => ({
      ...option,
      gameYes: option.people.filter((row) => gameVote(row, option.gameId) === "YES").length,
    }));
    return result;
  }
  // Case B must not replace seated players merely because waiting players prefer another game.
  if (seatedDateLocation) {
    state.reason = "GAME_DISAGREEMENT";
    return result;
  }
  const prefix = Math.min(...options.map((option) => option.firstPrefix));
  if (!Number.isFinite(prefix)) return result;
  state.phase = "WAITING";
  state.reason = null;
  state.consideredWaitingIds = queued.slice(0, prefix).map((row) => row.userId);
  result.candidates = options
    .filter((option) => option.firstPrefix <= prefix)
    .map((option) => {
      const people = [
        ...option.people,
        ...option.waiting.filter((row) => queued.indexOf(row) < prefix),
      ]
        .sort(priority)
        .slice(0, capacity);
      return {
        ...option,
        people,
        gameYes: people.filter((row) => gameVote(row, option.gameId) === "YES").length,
      };
    });
  return result;
}

interface Selection {
  dateIndex: number;
  locationIndex: number;
  choices: Array<{ prepared: Prepared; candidate: Candidate }>;
  users: Set<string>;
  dateLocationYes: number;
  gameYes: number;
  order: number[];
}
function earlier(a: readonly number[], b: readonly number[]) {
  const index = a.findIndex((value, position) => value !== b[position]);
  return a[index] < b[index];
}
function better(a: Selection, b: Selection) {
  return (
    a.dateLocationYes > b.dateLocationYes ||
    (a.dateLocationYes === b.dateLocationYes &&
      (a.gameYes > b.gameYes ||
        (a.gameYes === b.gameYes &&
          (a.users.size > b.users.size ||
            (a.users.size === b.users.size && earlier(a.order, b.order))))))
  );
}

/**
 * Exact joint selection: a person at several tables counts only once for event attendance
 * and event-level date/location votes. Game votes belong to their respective tables.
 * searchLimit is a server work budget, never a client-supplied preference; exhausting it
 * fails closed instead of silently confirming a greedy or partially explored proposal.
 */
/** Apply the proposal without stealing a pending reservation; displaced accepted users stay queued. */
export function projectReservedPlaces(
  registrations: readonly AgreementRegistration[],
  maxPlayers: number,
  participantIds?: readonly string[],
) {
  const base = allocateReservedPlaces(registrations, maxPlayers);
  if (!participantIds) return base;
  const participants = new Set(participantIds);
  const pending = new Set(
    base.seated.filter((row) => row.status === "PENDING").map((row) => row.id),
  );
  const all = [...base.seated, ...base.waiting];
  const seated = all.filter((row) =>
    row.status === "PENDING" ? pending.has(row.id) : participants.has(row.userId),
  );
  const ids = new Set(seated.map((row) => row.id));
  return { seated, waiting: all.filter((row) => !ids.has(row.id)) };
}

export function calculateEventAgreement(
  input: EventAgreementInput,
  searchLimit = 100_000,
): EventAgreement {
  // Bound candidate preparation as well as exact search; never approximate a confirmation.
  const preparationWork =
    input.dateIds.length *
    input.locationIds.length *
    input.tables.reduce((sum, table) => sum + table.gameIds.length, 0) *
    Math.max(1, input.registrations.length);
  if (preparationWork > 1_000_000) throw new Error("AGREEMENT_COMPLEXITY_LIMIT");
  const prepared = input.tables.map((table) => prepare(input, table));
  let winner: Selection | undefined;
  let searched = 0;
  for (const [dateIndex, dateId] of input.dateIds.entries()) {
    for (const [locationIndex, locationId] of input.locationIds.entries()) {
      const choices = prepared
        .map((item) => ({
          prepared: item,
          options: item.candidates.filter(
            (option) => option.dateIndex === dateIndex && option.locationIndex === locationIndex,
          ),
        }))
        .filter((item) => item.options.length > 0);
      if (choices.length === 0) continue;
      const dateLocationYes = (userId: string) =>
        input.fixedDateAndLocation
          ? 0
          : Number(input.dateVotes[userId]?.[dateId] === "YES") +
            Number(input.locationVotes[userId]?.[locationId] === "YES");
      const score = (users: Set<string>) =>
        [...users].reduce((sum, id) => sum + dateLocationYes(id), 0);
      const visit = (
        index: number,
        selected: Selection["choices"],
        users: Set<string>,
        gameYes: number,
      ) => {
        searched++;
        if (searched > searchLimit) throw new Error("AGREEMENT_COMPLEXITY_LIMIT");
        const order = [
          dateIndex,
          locationIndex,
          ...selected.map((item) => item.candidate.gameIndex),
        ];
        if (index === choices.length) {
          const candidate: Selection = {
            dateIndex,
            locationIndex,
            choices: [...selected],
            users,
            dateLocationYes: score(users),
            gameYes,
            order,
          };
          if (!winner || better(candidate, winner)) winner = candidate;
          return;
        }
        if (winner) {
          const possible = new Set(users);
          let addedCapacity = 0;
          let addedVotes = 0;
          let gameUpper = gameYes;
          const firstOrder = [...order];
          for (const remaining of choices.slice(index)) {
            let maxPeople = 0,
              maxDateVotes = 0,
              maxGameVotes = 0;
            for (const option of remaining.options) {
              for (const person of option.people) possible.add(person.userId);
              const newcomers = option.people.filter((row) => !users.has(row.userId));
              maxPeople = Math.max(maxPeople, newcomers.length);
              maxDateVotes = Math.max(
                maxDateVotes,
                newcomers.reduce((sum, row) => sum + dateLocationYes(row.userId), 0),
              );
              maxGameVotes = Math.max(maxGameVotes, option.gameYes);
            }
            addedCapacity += maxPeople;
            addedVotes += maxDateVotes;
            gameUpper += maxGameVotes;
            firstOrder.push(Math.min(...remaining.options.map((option) => option.gameIndex)));
          }
          const votesUpper = Math.min(score(possible), score(users) + addedVotes);
          const peopleUpper = Math.min(possible.size, users.size + addedCapacity);
          if (
            votesUpper < winner.dateLocationYes ||
            (votesUpper === winner.dateLocationYes &&
              (gameUpper < winner.gameYes ||
                (gameUpper === winner.gameYes &&
                  (peopleUpper < winner.users.size ||
                    (peopleUpper === winner.users.size && !earlier(firstOrder, winner.order))))))
          )
            return;
        }
        const next = choices[index];
        for (const option of next.options) {
          const union = new Set(users);
          for (const person of option.people) union.add(person.userId);
          selected.push({ prepared: next.prepared, candidate: option });
          visit(index + 1, selected, union, gameYes + option.gameYes);
          selected.pop();
        }
      };
      visit(0, [], new Set(), 0);
    }
  }
  const tables = prepared.map((item) => item.state);
  if (!winner)
    return {
      agreed: false,
      tables,
      situationKey: JSON.stringify(tables.map(({ tableId, reason }) => ({ tableId, reason }))),
    };
  const includedTables = winner.choices.map(({ prepared: item, candidate }) => {
    const selected = new Set(candidate.people.map((row) => row.userId));
    return {
      tableId: item.table.id,
      gameId: candidate.gameId,
      participantIds: [...selected],
      waitingIds: item.accepted.filter((row) => !selected.has(row.userId)).map((row) => row.userId),
    };
  });
  const plan = {
    dateId: input.dateIds[winner.dateIndex],
    locationId: input.locationIds[winner.locationIndex],
    includedTables,
    participantIds: [...winner.users].sort(),
    yesDateLocationVotes: winner.dateLocationYes,
    yesGameVotes: winner.gameYes,
  };
  const situationKey = JSON.stringify({
    dateId: plan.dateId,
    locationId: plan.locationId,
    tables: includedTables.map(({ tableId, gameId, participantIds }) => ({
      tableId,
      gameId,
      participantIds: [...participantIds].sort(),
    })),
  });
  return { agreed: true, ...plan, tables, situationKey };
}
