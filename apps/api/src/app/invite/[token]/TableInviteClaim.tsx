"use client";

import type { InviteReviewResponse, JoinTableInput } from "@board-game-organizer/schemas";
import {
  type ClaimResult,
  eventDateWall,
  eventLocalToIso,
  formatUsername,
  tableTitle,
  useTableInviteForm,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react";
import { CalendarDays, Dices, UsersRound } from "lucide-react";
import { useMemo } from "react";
import { InviteShell } from "./InviteShell";
import { InviteVotes } from "./InviteVotes";
import { inviteMessages as messages } from "./inviteMessages";

type Review = Extract<InviteReviewResponse, { kind: "TABLE" }>;
export function TableInviteClaim({
  review,
  busy,
  disabled,
  failed,
  onClaim,
  onRefresh,
}: {
  review: Review;
  busy: boolean;
  disabled: boolean;
  failed: boolean;
  onClaim: (input: { consent: true; participation?: JoinTableInput }) => Promise<ClaimResult>;
  onRefresh: () => void;
}) {
  const { i18n } = useLingui();
  const { event, table } = review;
  const tableName = tableTitle(table, (number) => {
    const label = i18n._(messages.tableLabel);
    return number === undefined ? label : `${label} #${number}`;
  });
  const {
    dateVotes,
    locationVotes,
    gameVotes,
    setDates,
    setLocations,
    setGames,
    alreadyAccepted,
    complete,
    settingsReady,
    submit,
  } = useTableInviteForm(review, busy || disabled, onClaim);
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: event.timeZone,
      }),
    [i18n.locale, event.timeZone],
  );
  return (
    <InviteShell title={i18n._(messages.tableTitle)}>
      <div style={{ display: "grid", gap: 8 }}>
        {[
          { id: "table", name: tableName, Icon: Dices },
          { id: "event", name: event.name, Icon: CalendarDays },
          { id: "group", name: review.group.name, Icon: UsersRound },
        ].map(({ id, name, Icon }) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon size={20} aria-hidden="true" />
            <span>{name}</span>
          </div>
        ))}
      </div>
      <p>
        {i18n._({
          ...messages.tableConsent,
          values: {
            inviter: formatUsername(review.inviter.username, review.inviter.name),
            group: review.group.name,
            table: tableName,
          },
        })}
      </p>
      <p style={{ color: "var(--muted)" }}>{i18n._(messages.queueHint)}</p>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>
        {i18n._({
          ...messages.expiry,
          values: { date: dateFormat.format(new Date(review.expiresAt)) },
        })}
      </p>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "var(--muted)", fontSize: 14 }}
      >
        <span>
          {i18n._({
            ...messages.players,
            values: { minimum: table.minPlayers, maximum: table.maxPlayers },
          })}
        </span>
        <span>{i18n._(table.rankingEnabled ? messages.rated : messages.unrated)}</span>
        <span>{i18n._(event.planningMode === "MANUAL" ? messages.manual : messages.assisted)}</span>
        <span>
          {i18n._(event.playerPreference === "BEST" ? messages.bestPlayers : messages.morePlayers)}
        </span>
      </div>
      <p>{i18n._(alreadyAccepted ? messages.currentParticipation : messages.voteHint)}</p>
      {!alreadyAccepted && !review.requiresAvailability ? (
        <p>{i18n._(messages.availabilityKept)}</p>
      ) : null}
      <InviteVotes
        title={i18n._(messages.dates)}
        options={event.dates.map((date) => ({
          id: date.id,
          label: dateFormat.format(
            new Date(eventLocalToIso(eventDateWall(event, date), event.timeZone)),
          ),
        }))}
        choices={dateVotes}
        editable={!alreadyAccepted && review.requiresAvailability}
        disabled={busy || disabled}
        onChange={(id, vote) => setDates((old) => ({ ...old, [id]: vote }))}
      />
      <InviteVotes
        title={i18n._(messages.locations)}
        options={event.locations.map((location) => ({
          id: location.id,
          label: location.name,
          description: location.address,
        }))}
        choices={locationVotes}
        editable={!alreadyAccepted && review.requiresAvailability}
        disabled={busy || disabled}
        onChange={(id, vote) => setLocations((old) => ({ ...old, [id]: vote }))}
      />
      <InviteVotes
        title={i18n._(messages.games)}
        options={table.games.map((game) => ({
          id: String(game.gameId),
          label:
            table.gamesDetail.find((detail) => detail.id === game.gameId)?.name ??
            i18n._(messages.unknown),
        }))}
        choices={gameVotes}
        editable={!alreadyAccepted}
        disabled={busy || disabled}
        onChange={(id, vote) => setGames((old) => ({ ...old, [id]: vote }))}
      />
      {!settingsReady ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          {i18n._(messages.settingsUnavailable)}
        </p>
      ) : null}
      {failed ? (
        <div role="alert">
          <p style={{ color: "var(--danger)" }}>{i18n._(messages.acceptFailure)}</p>
          <Button variant="secondary" onPress={onRefresh}>
            {i18n._(messages.retry)}
          </Button>
        </div>
      ) : null}
      <Button
        variant="primary"
        isDisabled={busy || disabled || !settingsReady || !complete}
        onPress={() => void submit()}
      >
        {i18n._(busy ? messages.accepting : messages.accept)}
      </Button>
    </InviteShell>
  );
}
