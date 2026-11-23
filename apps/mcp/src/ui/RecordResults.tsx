import {
  type BggSearchItem,
  eventStateSchema,
  type GroupRecordResponse,
  groupRevisionSchema,
  groupTypeSchema,
  type PlannedEventResponse,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { CalendarDays, Dices, History, UsersRound } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { z } from "zod";
import { EmptyList } from "@/components/common/ui/EmptyList";
import {
  type CardNavigation,
  cardNavigationClassName,
} from "@/components/common/ui/LinkedListCardLayout";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { EventCardView } from "@/components/events/EventCardView";
import { EventTableCardIndicatorView } from "@/components/events/EventTableCardIndicatorView";
import { EventTableCardView } from "@/components/events/EventTableCardView";
import { EventTableGamesPopoverView } from "@/components/events/EventTableGamesPopoverView";
import { GroupCardView } from "@/components/groups/GroupCardView";
import { openWeb, RejectedToolCall, record } from "./protocol";
import { useToolPages } from "./useToolPages";

const listKinds = {
  list_events: "event",
  list_event_tables: "table",
  list_table_history: "table",
  list_groups: "group",
  discover_groups: "group",
} as const;

const detailKinds = {
  get_event: "event",
  create_event: "event",
  update_event: "event",
  change_event_state: "event",
  finalize_event_results: "event",
  change_event_vote: "event",
  remove_event_participant: "event",
  get_table: "table",
  save_table_result: "table",
  get_group: "group",
  update_group: "group",
  get_group_moderation_review: "group",
  decide_group_moderation_review: "group",
} as const;

type Kind = (typeof listKinds)[keyof typeof listKinds];
type Row =
  | { kind: "event"; data: PlannedEventResponse }
  | { kind: "table"; data: PlannedTableResponse }
  | { kind: "group"; data: GroupRecordResponse };

const identity = { id: z.uuid(), name: z.string() };
const eventCard = z.object({
  ...identity,
  status: eventStateSchema,
  groupId: z.uuid().nullable(),
  tableCount: z.number(),
  dates: z.array(z.object({ id: z.uuid(), day: z.iso.date() })),
  locations: z.array(z.object({ id: z.uuid(), address: z.string() })),
  myRegistrations: z.array(z.object({ status: z.string() })),
});

const tableCard = z.object({
  ...identity,
  eventId: z.uuid(),
  eventName: z.string(),
  eventStatus: eventStateSchema,
  maxPlayers: z.number(),
  minPlayers: z.number(),
  seatedCount: z.number(),
  waitingCount: z.number(),
  rankingEnabled: z.boolean(),
  games: z.array(z.object({ gameId: z.number() })),
  gamesDetail: z.array(z.object({ id: z.number(), name: z.string() })),
  confirmed: z
    .object({
      startsAt: z.iso.datetime({ offset: true }),
      gameId: z.number(),
      playerIds: z.array(z.string()),
    })
    .optional(),
});

const groupCard = z.object({
  ...identity,
  type: groupTypeSchema,
  role: z.enum(["admin", "moderator", "accepted", "invited", "requested", "none"]),
  logo: z
    .string()
    .regex(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/)
    .nullable(),
  location: groupRevisionSchema.shape.location,
  canViewEvents: z.boolean(),
  memberCount: z.number(),
  eventCount: z.number().nullable(),
});

const pageShape = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() });

function readRow(kind: Kind, data: unknown): Row | undefined {
  // Validate the card boundary, keeping the complete authorized DTO for its Web indicators.
  if (kind === "event" && eventCard.safeParse(data).success)
    return { kind, data: data as PlannedEventResponse };
  if (kind === "table" && tableCard.safeParse(data).success)
    return { kind, data: data as PlannedTableResponse };
  if (kind === "group" && groupCard.safeParse(data).success)
    return { kind, data: data as GroupRecordResponse };
}

function readPage(kind: Kind, data: unknown) {
  const page = pageShape.safeParse(data);
  if (!page.success) return;
  const items: Row[] = [];
  for (const value of page.data.items) {
    const row = readRow(kind, value);
    if (!row) return;
    items.push(row);
  }
  return { items, nextCursor: page.data.nextCursor };
}

function recordKind(operation: string, kinds: Readonly<Record<string, Kind>>): Kind | undefined {
  return Object.hasOwn(kinds, operation) ? kinds[operation] : undefined;
}

export function isRecordResultOperation(operation: string) {
  return Boolean(recordKind(operation, listKinds) ?? recordKind(operation, detailKinds));
}

export function RecordResults({
  app,
  operation,
  data,
  input,
  viewerUserId,
  renderGameRow,
}: {
  app: App;
  operation: string;
  data: unknown;
  input?: unknown;
  viewerUserId?: string;
  renderGameRow: (game: BggSearchItem) => ReactNode;
}) {
  const { t } = useLingui();
  const listKind = recordKind(operation, listKinds);
  const kind = listKind ?? recordKind(operation, detailKinds);
  const initial = useMemo(
    () => (listKind ? readPage(listKind, data) : undefined),
    [listKind, data],
  );
  const pages = useToolPages(app, operation, input, initial, (value) => {
    const next = listKind && readPage(listKind, value);
    if (!next) throw new Error("Invalid BGO page");
    return next;
  });
  const [linkError, setLinkError] = useState(false);

  if (!kind) return null;
  const query = record(record(input)?.query);
  const history = operation === "list_table_history" && !query?.section;
  const moderation = operation.endsWith("_moderation_review") || query?.scope === "moderation";
  const Icon = history
    ? History
    : kind === "event"
      ? CalendarDays
      : kind === "table"
        ? Dices
        : UsersRound;
  const label =
    kind === "event"
      ? listKind
        ? t`Events`
        : t`Event`
      : kind === "table"
        ? history
          ? t`History`
          : listKind
            ? t`Tables`
            : t`Table`
        : listKind
          ? t`Groups`
          : t`Group`;
  const errors = {
    event: listKind ? t`Could not load events` : t`Could not load event`,
    table: listKind ? t`Could not load tables` : t`Could not load table`,
    group: listKind ? t`Could not load groups` : t`Could not load group`,
  };
  const empty = {
    event: t`No events found`,
    table: t`No tables found`,
    group: t`No groups found`,
  };
  const detail = listKind
    ? undefined
    : readRow(kind, operation === "save_table_result" ? record(data)?.table : data);
  const denied =
    pages.error instanceof RejectedToolCall && [401, 403, 404].includes(pages.error.status);
  const records = denied ? undefined : pages.data?.pages.flatMap((page) => page.items);
  const items = listKind
    ? records && Array.from(new Map(records.map((item) => [item.data.id, item])).values())
    : detail && [detail];

  async function navigate(href: string) {
    try {
      setLinkError(!(await openWeb(app, href)));
    } catch {
      setLinkError(true);
    }
  }

  const renderNavigation: CardNavigation = ({ href, label, description, disabled }) => (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      aria-description={description}
      isDisabled={disabled}
      onPress={() => void navigate(href)}
      className={`${cardNavigationClassName} h-full w-full p-0`}
    />
  );

  return (
    <section aria-label={label} className="space-y-3">
      <SectionHeaderCard
        title={label}
        leading={<Icon className="size-5 text-accent" aria-hidden />}
      />
      {items?.map((item) => {
        if (item.kind === "event")
          return (
            <EventCardView
              key={item.data.id}
              event={item.data}
              context={query?.groupId ? "group" : "personal"}
              renderNavigation={renderNavigation}
            />
          );
        if (item.kind === "table")
          return (
            <EventTableCardView
              key={item.data.id}
              table={item.data}
              context={operation === "list_event_tables" ? "event" : "personal"}
              renderNavigation={renderNavigation}
              indicators={
                <EventTableCardIndicatorView
                  table={item.data}
                  userId={viewerUserId}
                  renderGames={(props) => (
                    <EventTableGamesPopoverView {...props} renderGameRow={renderGameRow} />
                  )}
                />
              }
            />
          );
        return (
          <GroupCardView
            key={item.data.id}
            group={item.data}
            href={moderation ? `/moderation/${item.data.id}` : undefined}
            renderNavigation={renderNavigation}
          />
        );
      })}
      {items && !items.length ? (
        <EmptyList icon={<Icon className="size-8" />}>{empty[kind]}</EmptyList>
      ) : null}
      {!items || pages.isFetchNextPageError ? (
        <p role="alert" className="text-danger">
          {errors[kind]}
        </p>
      ) : null}
      {linkError ? <p role="alert" className="text-danger">{t`Something went wrong`}</p> : null}
      {pages.isFetchingNextPage ? (
        <Skeleton aria-label={t`Loading…`} className="h-10 w-full rounded-xl" />
      ) : null}
      {pages.hasNextPage && !denied ? (
        <Button
          variant="outline"
          isDisabled={pages.isFetchingNextPage}
          onPress={() => void pages.fetchNextPage({ cancelRefetch: false })}
        >
          {pages.isFetchNextPageError
            ? t`Try again`
            : kind === "table"
              ? t`Load more tables`
              : kind === "group"
                ? t`Load more groups`
                : t`Load more`}
        </Button>
      ) : null}
    </section>
  );
}
