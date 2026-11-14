import type { EventProposalResponse, EventProposalsResponse } from "@board-game-organizer/schemas";
import { hashKey, notifyManager, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { cancelOptimisticResource, updateOptimisticBase } from "../common/optimisticOperation";
import { CommunityApiError } from "../community/communityApi";
import { filterCommunityPages } from "../community/queryCache";
import { revokeCachedGroupAccess } from "../groups/groupAccessCache";

type Owner = { apiUrl: string; userId?: string | null };
export type EventProposalCategory = "date" | "location" | "game";
export type EventProposalScope = {
  eventId: string;
  groupId: string | null;
  kind: EventProposalCategory;
  tableId?: string;
  mode: "mine" | "review";
};
export const EVENT_PROPOSAL_PAGE_SIZE = 5;
export const eventProposalKeys = {
  root: (o: Owner) => ["events", o.apiUrl, o.userId, "proposals"] as const,
  page: (o: Owner, s: EventProposalScope, cursor = "") =>
    [
      ...eventProposalKeys.root(o),
      s.eventId,
      s.mode,
      s.groupId,
      s.kind,
      s.tableId ?? null,
      cursor,
      ...(s.mode === "review" ? ["grouped-v2"] : []),
    ] as const,
  groupReviewResource: (o: Owner, id: string) =>
    ["groups", o.apiUrl, o.userId, id, "proposal-review"] as const,
  reviewResource: (o: Owner, id: string) =>
    ["events", o.apiUrl, o.userId, id, "proposal-review"] as const,
};
export type ClientEventProposal = EventProposalResponse & { clientAction?: "accept" | "reject" };
export type ClientProposalPage = Omit<EventProposalsResponse, "items"> & {
  items: ClientEventProposal[];
};
function page(data: unknown): data is ClientProposalPage {
  return Boolean(
    data &&
      typeof data === "object" &&
      "items" in data &&
      Array.isArray(data.items) &&
      "eventId" in data &&
      "eventVersion" in data,
  );
}
/** Client-only decision marker; never invent accepted status or canonical option identity. */
export function projectProposalReview(
  data: unknown,
  eventId: string,
  id: string,
  eventVersion: number,
  version: number,
  action: "accept" | "reject",
  game?: { gameId: number; tableId: string },
): unknown {
  if (!page(data) || data.eventId !== eventId || data.eventVersion > eventVersion) return data;
  return {
    ...data,
    items: data.items.map((row) =>
      ((row.id === id && row.version === version) ||
        (game &&
          row.payload.kind === "game" &&
          row.payload.gameId === game.gameId &&
          row.payload.tableId === game.tableId)) &&
      row.status === "PENDING"
        ? { ...row, clientAction: action }
        : row,
    ),
  };
}
/** ACK replaces known records only, keeping newer source decisions and unrelated rows. */
export function commitProposalReceipt(data: unknown, value: EventProposalResponse): unknown {
  if (!page(data) || data.eventId !== value.eventId) return data;
  return {
    ...data,
    items: data.items.map((row) => {
      const next = row.id === value.id && row.version <= value.version ? value : row;
      const source = row.suggestions ?? row.gameSuggestions;
      if (!source) return next;
      const suggestions = source.map((s) =>
        s.id === value.id && s.version <= value.version
          ? { ...s, version: value.version, status: value.status }
          : s,
      );
      return {
        ...next,
        ...(row.suggestions ? { suggestions } : {}),
        ...(row.gameSuggestions ? { gameSuggestions: suggestions } : {}),
      };
    }),
  };
}
/** A known server creation can enter only its already-materialized first source page. */
export function commitProposalCreation(
  data: unknown,
  key: QueryKey,
  value: EventProposalResponse,
  userId?: string | null,
): unknown {
  if (
    !page(data) ||
    key[9] !== "" ||
    data.eventId !== value.eventId ||
    key[7] !== value.payload.kind ||
    (value.payload.kind === "game" && key[8] !== value.payload.tableId) ||
    (data.mode === "mine" && value.userId !== userId)
  )
    return data;
  // Review pages are source-grouped; a single creation cannot invent complete membership/revision.
  if (data.mode === "review") return data;
  const known = data.items.find((row) => row.id === value.id);
  if (known) return commitProposalReceipt(data, value);
  const rows = [...data.items, value].sort((a, b) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
  );
  const items = rows.slice(0, EVENT_PROPOSAL_PAGE_SIZE),
    last = items.at(-1);
  return {
    ...data,
    items,
    nextCursor:
      rows.length > EVENT_PROPOSAL_PAGE_SIZE && last
        ? `${last.createdAt}|${last.id}`
        : data.nextCursor,
  };
}
export function reconcileProposalAccessError(
  client: QueryClient,
  owner: Owner,
  target: { eventId: string; groupId: string | null },
  error: unknown,
  keepKey?: QueryKey,
) {
  if (!(error instanceof CommunityApiError)) return;
  if (error.code === "EVENT_ADMIN_REQUIRED")
    revokeProposalReview(client, owner, { eventId: target.eventId }, keepKey);
  else if (
    [
      "GROUP_MEMBER_REQUIRED",
      "GROUP_BANNED",
      "GROUP_NOT_FOUND",
      "EVENT_NOT_FOUND",
      "Unauthorized",
    ].includes(error.code)
  ) {
    if (target.groupId) revokeCachedGroupAccess(client, owner, target.groupId, false);
    else revokeStandaloneEventAccess(client, owner, target.eventId, error, keepKey);
  }
}
function eventPicker(key: QueryKey, eventId: string) {
  return [key[7], key[10]].some(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      "eventId" in value &&
      value.eventId === eventId,
  );
}
function standaloneList(key: QueryKey) {
  return (
    key[0] === "events" &&
    ((key[3] === "list" &&
      (!key[4] || typeof key[4] !== "object" || !("groupId" in key[4]) || !key[4].groupId)) ||
      (key[3] === "tables" && key[4] === null))
  );
}
function withoutEvent(data: unknown, eventId: string) {
  return filterCommunityPages<{ id?: string; eventId?: string }>(
    data,
    (row) => row.id !== eventId && row.eventId !== eventId,
  );
}
/** Only a verified source read denial may revoke the standalone Event and dependent writers. */
function revokeStandaloneEventAccess(
  client: QueryClient,
  owner: Owner,
  eventId: string,
  error: CommunityApiError,
  keepKey?: QueryKey,
) {
  const queries = client.getQueryCache().findAll({
    predicate: (q) =>
      q.queryKey[1] === owner.apiUrl &&
      q.queryKey[2] === owner.userId &&
      ((q.queryKey[0] === "events" && (q.queryKey[4] === eventId || standaloneList(q.queryKey))) ||
        (q.queryKey[0] === "bgg-picker" && eventPicker(q.queryKey, eventId))),
  });
  notifyManager.batch(() => {
    // This prefix also fences cold queued submissions with no materialized Query data.
    cancelOptimisticResource(client, ["events", owner.apiUrl, owner.userId, eventId]);
    for (const mutation of client.getMutationCache().findAll({
      mutationKey: ["events", owner.apiUrl, owner.userId, "mutation", eventId, "propose"],
      status: "error",
    }))
      client.getMutationCache().remove(mutation);
    for (const q of queries) {
      // Let the rejecting source fetch publish its real denial instead of a CancelledError.
      if (!keepKey || hashKey(q.queryKey) !== hashKey(keepKey))
        void client.cancelQueries({ queryKey: q.queryKey, exact: true }, { revert: false });
      if (standaloneList(q.queryKey)) {
        updateOptimisticBase(client, q.queryKey, (data) => withoutEvent(data, eventId));
        void client.invalidateQueries({ queryKey: q.queryKey, exact: true, refetchType: "active" });
      } else {
        q.setState({ data: undefined, dataUpdatedAt: 0, error, status: "error" });
        if (!keepKey || hashKey(q.queryKey) !== hashKey(keepKey))
          client.removeQueries({ queryKey: q.queryKey, exact: true });
      }
    }
  });
}
/** A retained denied source query fences disk-only Event scopes before native hydration. */
export function filterRevokedStandaloneEventRestore<
  T extends { queryKey: QueryKey; state: { data: unknown } },
>(client: QueryClient, saved: readonly T[]): T[] {
  let filtered = [...saved];
  for (const query of client.getQueryCache().getAll()) {
    const key = query.queryKey;
    if (
      key[0] !== "events" ||
      typeof key[4] !== "string" ||
      !(
        (key[3] === "proposals" && key[6] === null) ||
        (key[3] === "participants" && key[6] === "review" && key[7] === null)
      ) ||
      !(query.state.error instanceof CommunityApiError) ||
      !["EVENT_NOT_FOUND", "Unauthorized"].includes(query.state.error.code)
    )
      continue;
    const eventId = key[4];
    filtered = filtered.flatMap((row) => {
      const candidate = row.queryKey;
      if (candidate[1] !== key[1] || candidate[2] !== key[2]) return [row];
      if (
        (candidate[0] === "events" && candidate[4] === eventId) ||
        (candidate[0] === "bgg-picker" && eventPicker(candidate, eventId))
      )
        return [];
      return standaloneList(candidate)
        ? [{ ...row, state: { ...row.state, data: withoutEvent(row.state.data, eventId) } }]
        : [row];
    });
  }
  return filtered;
}
/** Verified management loss is distinct from membership loss. Own proposals/ordinary writes survive. */
export function revokeProposalReview(
  client: QueryClient,
  owner: Owner,
  target: { eventId: string } | { groupId: string },
  keepKey?: QueryKey,
) {
  const queries = client.getQueryCache().findAll({
    queryKey: eventProposalKeys.root(owner),
    predicate: (q) =>
      q.queryKey[5] === "review" &&
      ("eventId" in target ? q.queryKey[4] === target.eventId : q.queryKey[6] === target.groupId),
  });
  const pickers = client.getQueryCache().findAll({
    queryKey: ["bgg-picker", owner.apiUrl, owner.userId],
    predicate: (q) => {
      const scope = q.queryKey[10];
      return (
        q.queryKey[8] === "sources-v2" &&
        q.queryKey[9] === true &&
        Boolean(
          scope &&
            typeof scope === "object" &&
            "eventId" in scope &&
            typeof scope.eventId === "string" &&
            ("eventId" in target
              ? "eventId" in scope && scope.eventId === target.eventId
              : "groupId" in scope && scope.groupId === target.groupId),
        )
      );
    },
  });
  const participantReviews = client.getQueryCache().findAll({
    queryKey: ["events", owner.apiUrl, owner.userId, "participants"],
    predicate: (q) =>
      q.queryKey[5] === "roles-v2" &&
      q.queryKey[6] === "review" &&
      ("eventId" in target ? q.queryKey[4] === target.eventId : q.queryKey[7] === target.groupId),
  });
  const ids = new Set([...queries, ...participantReviews].map((q) => String(q.queryKey[4])));
  for (const picker of pickers) {
    const scope = picker.queryKey[10] as { eventId: string };
    ids.add(scope.eventId);
  }
  if ("eventId" in target) ids.add(target.eventId);
  notifyManager.batch(() => {
    if ("groupId" in target)
      cancelOptimisticResource(
        client,
        eventProposalKeys.groupReviewResource(owner, target.groupId),
      );
    for (const id of ids)
      cancelOptimisticResource(client, eventProposalKeys.reviewResource(owner, id));
    void client.invalidateQueries(
      {
        queryKey: ["events", owner.apiUrl, owner.userId, "detail"],
        predicate: (q) => ids.has(String(q.queryKey[4])),
      },
      { cancelRefetch: false },
    );
    for (const q of [...queries, ...pickers, ...participantReviews]) {
      q.setState({
        data: undefined,
        dataUpdatedAt: 0,
        error: new CommunityApiError(403, "EVENT_ADMIN_REQUIRED"),
        status: "error",
      });
      if (!keepKey || hashKey(q.queryKey) !== hashKey(keepKey))
        client.removeQueries({ queryKey: q.queryKey, exact: true });
    }
  });
}
