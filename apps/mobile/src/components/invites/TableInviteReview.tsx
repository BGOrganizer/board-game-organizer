import type { InviteReviewResponse } from "@board-game-organizer/schemas";
import {
  type ClaimResult,
  eventDateWall,
  eventLocalToIso,
  formatUsername,
  type InviteClaimInput,
  useTableInviteForm,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, Dices, type LucideIcon, UsersRound } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { InputSectionList } from "@/components/common/ui/InputSectionList";
import { EventVoteButtons } from "@/components/events/EventVoteButtons";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";

type Review = Extract<InviteReviewResponse, { kind: "TABLE" }>;
type Row =
  | { kind: "date"; value: Review["event"]["dates"][number] }
  | { kind: "location"; value: Review["event"]["locations"][number] }
  | { kind: "game"; value: Review["table"]["games"][number] };
export function TableInviteReview({
  review,
  disabled,
  pending,
  failed,
  readFailed,
  onClaim,
  onRefresh,
}: {
  review: Review;
  disabled: boolean;
  pending: boolean;
  failed: boolean;
  readFailed: boolean;
  onClaim: (input: InviteClaimInput) => Promise<ClaimResult>;
  onRefresh: () => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const insets = useSafeAreaInsets();
  const form = useTableInviteForm(review, disabled, onClaim);
  const { event, table } = review;
  const sections = useMemo<{ title: string; data: Row[] }[]>(
    () => [
      { title: "Dates", data: event.dates.map((value) => ({ kind: "date", value })) },
      { title: "Locations", data: event.locations.map((value) => ({ kind: "location", value })) },
      { title: "Games", data: table.games.map((value) => ({ kind: "game", value })) },
    ],
    [event.dates, event.locations, table.games],
  );
  const voteButtons = (row: Row, id: string, label: string) => {
    const options =
      row.kind === "game" ? table.games : row.kind === "date" ? event.dates : event.locations;
    if (
      form.alreadyAccepted ||
      options.length < 2 ||
      (row.kind !== "game" && !review.requiresAvailability)
    )
      return undefined;
    const votes =
      row.kind === "game"
        ? form.gameVotes
        : row.kind === "date"
          ? form.dateVotes
          : form.locationVotes;
    const set =
      row.kind === "game" ? form.setGames : row.kind === "date" ? form.setDates : form.setLocations;
    return (
      <EventVoteButtons
        label={label}
        value={votes[id]}
        busy={disabled}
        onChange={(vote) => set((old) => ({ ...old, [id]: vote }))}
      />
    );
  };
  return (
    <View className="bg-background" style={{ flex: 1 }}>
      <InputSectionList
        sections={sections}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Typography style={{ fontSize: 16, fontWeight: "600", paddingTop: 16, paddingBottom: 8 }}>
            {t(section.title)}
          </Typography>
        )}
        keyExtractor={(row) =>
          `${row.kind}:${row.kind === "game" ? row.value.gameId : row.value.id}`
        }
        contentContainerStyle={{ padding: 20, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 12 }}>
            <InvitationIdentity name={table.name} icon={Dices} heading />
            <InvitationIdentity name={event.name} icon={CalendarDays} />
            <InvitationIdentity name={review.group.name} icon={UsersRound} />
            <Typography>
              {i18n._({
                id: "invite.tableConsent",
                message:
                  "Accepting makes you friends with {inviter}, joins the private group {group}, and accepts your participation at {table}.",
                values: {
                  inviter: formatUsername(review.inviter.username, review.inviter.name),
                  group: review.group.name,
                  table: table.name,
                },
              })}
            </Typography>
            <Typography className="text-muted">
              {t("If the table is full, you will join its waiting list.")}
            </Typography>
            <Typography className="text-muted">
              {i18n._({
                id: "invite.expiry",
                message: "Single-use invitation. Expires on {date}.",
                values: {
                  date: new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: event.timeZone,
                  }).format(new Date(review.expiresAt)),
                },
              })}
            </Typography>
            <Typography className="text-muted">
              {i18n._({
                id: "invite.players",
                message: "Players: {minimum}–{maximum}",
                values: { minimum: table.minPlayers, maximum: table.maxPlayers },
              })}{" "}
              · {t(table.rankingEnabled ? "Rated table" : "Unrated table")} ·{" "}
              {t(event.planningMode === "MANUAL" ? "Manual planning" : "Assisted planning")} ·{" "}
              {t(event.playerPreference === "BEST" ? "Best BGG player count" : "Maximize players")}
            </Typography>
            <Typography>
              {t(
                form.alreadyAccepted
                  ? "You already participate at this table. Your place and choices will be kept."
                  : "Joining accepts single options. For sections with multiple options, answer every option and choose at least one Yes or If needed.",
              )}
            </Typography>
            {!form.alreadyAccepted && !review.requiresAvailability ? (
              <Typography>{t("Your existing event availability will be kept.")}</Typography>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "date") {
            const value = eventDateWall(event, item.value);
            return (
              <GroupedRow>
                <View style={{ flex: 1 }}>
                  <DateTimeInfo
                    startsAt={eventLocalToIso(value, event.timeZone)}
                    timeZone={event.timeZone}
                  />
                </View>
                {voteButtons(item, item.value.id, value.replace("T", " "))}
              </GroupedRow>
            );
          }
          if (item.kind === "location")
            return (
              <LocationListRow
                name={item.value.name}
                address={item.value.address}
                actions={voteButtons(item, item.value.id, item.value.name)}
              />
            );
          const game = table.gamesDetail.find((detail) => detail.id === item.value.gameId);
          const name = game?.name ?? t("Unknown");
          return (
            <GameListRow
              game={game}
              name={name}
              imageUrl={game?.imageUrl}
              durationMinutes={item.value.durationMinutes}
              actions={voteButtons(item, String(item.value.gameId), name)}
            />
          );
        }}
      />
      <View style={{ padding: 20, paddingBottom: Math.max(insets.bottom, 20), gap: 12 }}>
        <View style={{ gap: 12 }}>
          {!form.settingsReady ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("The table settings are incomplete. Ask the inviter to update them.")}
            </Typography>
          ) : null}
          {failed || readFailed ? (
            <>
              <Typography accessibilityRole="alert" className="text-danger">
                {t(
                  readFailed
                    ? "Could not load this invitation."
                    : "Could not accept this invitation. Refresh the details and try again.",
                )}
              </Typography>
              <Button variant="secondary" onPress={onRefresh}>
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            </>
          ) : null}
        </View>
        <Button
          testID="table-link-consent-submit"
          isDisabled={disabled || !form.settingsReady || !form.complete}
          onPress={() => void form.submit()}
        >
          <Button.Label>{t(pending ? "Accepting invitation…" : "Accept invitation")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}

function InvitationIdentity({
  name,
  icon: Icon,
  heading = false,
}: {
  name: string;
  icon: LucideIcon;
  heading?: boolean;
}) {
  const foreground = useThemeColor("foreground");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Icon size={20} color={foreground} accessible={false} />
      <Typography
        style={{ flex: 1, fontSize: heading ? 22 : 16, fontWeight: heading ? "700" : "400" }}
      >
        {name}
      </Typography>
    </View>
  );
}
