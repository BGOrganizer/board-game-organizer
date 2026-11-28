import type {
  GroupRecordResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { eventOptionsRequireVote, tableCardGames } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { EventDetailView } from "@/components/events/EventDetailView";
import { EventOverview } from "@/components/events/EventOverview";
import { EventTableCardIndicatorView } from "@/components/events/EventTableCardIndicatorView";
import { EventTableDetailView } from "@/components/events/EventTableDetailView";
import { EventTableGamesPopoverView } from "@/components/events/EventTableGamesPopoverView";
import { EventTableInfoView } from "@/components/events/EventTableInfoView";
import { EventTableParticipantsHelp } from "@/components/events/EventTableParticipantsHelp";
import { EventTableScheduleCard } from "@/components/events/EventTableScheduleCard";
import { EventVoteLegendContent } from "@/components/events/EventVoteLegendContent";
import { GroupDetailView } from "@/components/groups/GroupDetailView";
import { McpGameListRow } from "./McpGameListRow";
import { callToolResult } from "./protocol";
import { RankingResults } from "./RankingResults";
import { type RecordResultRow, RecordResults } from "./RecordResults";
import { RosterResults } from "./RosterResults";
import { TableFinalResults } from "./TableFinalResults";
import { WidgetLink } from "./WidgetLink";

type DetailProps = { app: App; initialTab?: string; viewerUserId?: string };

export function RecordDetailResults({ row, ...props }: DetailProps & { row: RecordResultRow }) {
  return (
    <div className="space-y-4">
      {row.kind === "event" ? (
        <EventDetail {...props} event={row.data} />
      ) : row.kind === "group" ? (
        <GroupDetail {...props} group={row.data} />
      ) : (
        <TableDetail {...props} table={row.data} />
      )}
    </div>
  );
}

function EventDetail({
  app,
  event,
  initialTab,
  viewerUserId,
}: DetailProps & { event: PlannedEventResponse }) {
  const { t } = useLingui();
  const [tab, setTab] = useState(initialTab ?? "details");
  return (
    <EventDetailView
      event={event}
      selectedKey={tab}
      onSelectionChange={setTab}
      details={
        <EventOverview
          event={event}
          namedVotes={event.voteVoters}
          group={
            event.groupId ? (
              <WidgetLink app={app} path={`/groups/${event.groupId}`}>
                {event.groupName ?? t`Group`}
              </WidgetLink>
            ) : undefined
          }
        />
      }
      participants={
        event.readOnly ? (
          <p className="text-muted">{t`Public event. Group membership is not required to participate.`}</p>
        ) : (
          <DetailPanel
            app={app}
            viewerUserId={viewerUserId}
            operation="list_event_participants"
            input={{
              params: { eventId: event.id },
              ...(event.canManage ? { query: { view: "review" } } : {}),
            }}
            render={(props) => <RosterResults {...props} embedded />}
          />
        )
      }
      tables={
        <DetailPanel
          app={app}
          viewerUserId={viewerUserId}
          operation="list_event_tables"
          input={{ params: { eventId: event.id } }}
          render={(props) => (
            <RecordResults
              {...props}
              embedded
              renderGameRow={(game) => <McpGameListRow app={app} game={game} />}
            />
          )}
        />
      }
    />
  );
}

function GroupDetail({
  app,
  group,
  initialTab,
  viewerUserId,
}: DetailProps & { group: GroupRecordResponse }) {
  const [tab, setTab] = useState(initialTab ?? "info");
  const params = { groupId: group.id };
  return (
    <GroupDetailView
      group={group}
      selectedKey={tab}
      onSelectionChange={setTab}
      members={
        <DetailPanel
          app={app}
          viewerUserId={viewerUserId}
          operation="list_group_members"
          input={{ params }}
          render={(props) => <RosterResults {...props} embedded />}
        />
      }
      events={
        <DetailPanel
          app={app}
          viewerUserId={viewerUserId}
          operation="list_events"
          input={{ query: { groupId: group.id } }}
          render={(props) => (
            <RecordResults
              {...props}
              embedded
              renderGameRow={(game) => <McpGameListRow app={app} game={game} />}
            />
          )}
        />
      }
      rankings={
        <DetailPanel
          app={app}
          viewerUserId={viewerUserId}
          operation="list_group_leaderboard"
          input={{ params }}
          render={(props) => (
            <RankingResults {...props} operation="list_group_leaderboard" embedded />
          )}
        />
      }
    />
  );
}

function TableDetail({
  app,
  table,
  initialTab,
  viewerUserId,
}: DetailProps & { table: PlannedTableResponse }) {
  const { t } = useLingui();
  const [requested, setTab] = useState(initialTab ?? "overview");
  const planning = table.eventStatus === "PLANNING";
  const votedGames = planning && eventOptionsRequireVote(table.games, table.gameVoteRequired);
  const proposals = planning && !table.readOnly && table.allowParticipantGames === true;
  const tab =
    (requested === "results" && !planning) ||
    (requested === "participants" && !table.sharedResultsOnly)
      ? requested
      : "overview";
  const params = { eventId: table.eventId, tableId: table.id };
  return (
    <EventTableDetailView
      table={table}
      selectedKey={tab}
      onSelectionChange={setTab}
      info={
        <EventTableInfoView
          table={table}
          indicators={
            <EventTableCardIndicatorView
              table={table}
              userId={viewerUserId}
              renderGames={(props) => (
                <EventTableGamesPopoverView
                  {...props}
                  renderGameRow={(game) => <McpGameListRow app={app} game={game} />}
                />
              )}
            />
          }
        />
      }
      details={
        <section className="space-y-4">
          <HelpSectionCard title={t`Details`} label={t`Table details help`} icon={Info}>
            {votedGames ? (
              <EventVoteLegendContent
                scope="table"
                singleOption={table.gameVoteRequired ? "only" : undefined}
              />
            ) : null}
            {proposals ? (
              <p>{t`Players seated at this table can propose other games for a manager to approve.`}</p>
            ) : null}
            {!votedGames && !proposals ? (
              <p>{t`See the schedule and board games for this table below.`}</p>
            ) : null}
          </HelpSectionCard>
          <EventTableScheduleCard
            table={table}
            timeZone={table.eventSchedule?.location?.timeZone}
          />
          <section aria-label={t`Board games`} className="space-y-3">
            <h2 className="font-semibold">{t`Board games`}</h2>
            <GroupedList>
              {tableCardGames(table).map((game) => (
                <McpGameListRow app={app} key={game.id} game={game} />
              ))}
            </GroupedList>
          </section>
          <WidgetLink app={app} path={`/events/${table.eventId}`}>
            {table.eventName}
          </WidgetLink>
          {table.groupId ? (
            <WidgetLink app={app} path={`/groups/${table.groupId}`}>
              {table.groupName ?? t`Group`}
            </WidgetLink>
          ) : null}
        </section>
      }
      participants={
        <section className="space-y-4">
          <EventTableParticipantsHelp planning={planning} />
          <DetailPanel
            app={app}
            viewerUserId={viewerUserId}
            operation="list_table_seats"
            input={{ params }}
            render={(props) => <RosterResults {...props} embedded />}
          />
        </section>
      }
      results={
        table.eventStatus === "TERMINATED" ? (
          <TableFinalResults app={app} data={table} />
        ) : table.confirmed ? (
          <DetailPanel
            app={app}
            viewerUserId={viewerUserId}
            operation="list_table_leaderboard"
            input={{ params }}
            render={(props) => (
              <RankingResults {...props} operation="list_table_leaderboard" embedded />
            )}
          />
        ) : (
          <p>{t`Excluded from confirmation`}</p>
        )
      }
    />
  );
}

type PanelRead = {
  app: App;
  operation: string;
  input: Record<string, unknown>;
  viewerUserId?: string;
};

function DetailPanel({
  render,
  ...props
}: PanelRead & { render: (result: PanelRead & { data: unknown }) => ReactNode }) {
  const { t } = useLingui();
  const { app, operation, input, viewerUserId } = props;
  const read = useQuery({
    queryKey: ["mcp-detail", viewerUserId, operation, input],
    queryFn: async ({ signal }) => {
      const result = await callToolResult(app, operation, input, signal);
      if (viewerUserId && result.viewerUserId && result.viewerUserId !== viewerUserId)
        throw new Error("BGO viewer changed");
      return result;
    },
    staleTime: Infinity,
  });
  if (read.isPending)
    return <Skeleton aria-label={t`Loading…`} className="h-24 w-full rounded-xl" />;
  if (read.isError)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-danger">{t`Something went wrong`}</p>
        <Button
          variant="outline"
          size="sm"
          onPress={() => void read.refetch()}
        >{t`Try again`}</Button>
      </div>
    );
  return render({ ...props, data: read.data.data });
}
