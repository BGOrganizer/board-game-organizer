import type { EventProposalResponse, EventProposalsResponse } from "@board-game-organizer/schemas";
import { hashKey, notifyManager, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { cancelOptimisticResource } from "../common/optimisticOperation";
import { CommunityApiError } from "../community/communityApi";
import { revokeCachedGroupAccess } from "../groups/groupAccessCache";

type Owner = { apiUrl: string; userId?: string | null };
export type EventProposalCategory = "date" | "location" | "game";
export type EventProposalScope = {
  eventId: string;
  groupId: string;
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
): unknown {
  if (!page(data) || data.eventId !== eventId || data.eventVersion > eventVersion) return data;
  return {
    ...data,
    items: data.items.map((row) =>
      row.id === id && row.version === version && row.status === "PENDING"
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
    items: data.items.map((row) =>
      row.id === value.id && row.version <= value.version ? value : row,
    ),
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
  target: { eventId: string; groupId: string },
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
  )
    revokeCachedGroupAccess(client, owner, target.groupId, false);
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
  const ids = new Set(queries.map((q) => String(q.queryKey[4])));
  if ("eventId" in target) ids.add(target.eventId);
  notifyManager.batch(() => {
    if ("groupId" in target)
      cancelOptimisticResource(
        client,
        eventProposalKeys.groupReviewResource(owner, target.groupId),
      );
    for (const id of ids)
      cancelOptimisticResource(client, eventProposalKeys.reviewResource(owner, id));
    if ("groupId" in target)
      void client.invalidateQueries(
        {
          queryKey: ["events", owner.apiUrl, owner.userId, "detail"],
          predicate: (q) => ids.has(String(q.queryKey[4])),
        },
        { cancelRefetch: false },
      );
    for (const q of queries) {
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
