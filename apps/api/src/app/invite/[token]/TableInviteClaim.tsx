"use client";

import type {
  EventVote,
  InviteReviewResponse,
  JoinTableInput,
} from "@board-game-organizer/schemas";
import {
  type ClaimResult,
  eventDateWall,
  eventLocalToIso,
  eventOptionVotesAreComplete,
  eventVotingChoices,
  formatUsername,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react";
import { useMemo, useRef, useState } from "react";
import { InviteShell } from "./InviteShell";
import { InviteVotes } from "./InviteVotes";
import { inviteMessages as messages } from "./inviteMessages";

type Review = Extract<InviteReviewResponse, { kind: "TABLE" }>;
type Choices = JoinTableInput["gameVotes"];
function explicitVotes(choices: Readonly<Record<string, EventVote>> | undefined): Choices {
  return Object.fromEntries(
    Object.entries(choices ?? {}).filter(([, vote]) => vote !== "UNKNOWN"),
  ) as Choices;
}
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
  const gameOptions = useMemo(
    () => table.games.map((game) => ({ id: String(game.gameId) })),
    [table.games],
  );
  const [dateVotes, setDates] = useState<Choices>(() =>
    eventVotingChoices(event.dates, explicitVotes(review.ownAvailability?.dateVotes)),
  );
  const [locationVotes, setLocations] = useState<Choices>(() =>
    eventVotingChoices(event.locations, explicitVotes(review.ownAvailability?.locationVotes)),
  );
  const [gameVotes, setGames] = useState<Choices>(() =>
    eventVotingChoices(gameOptions, explicitVotes(review.ownRegistration?.gameVotes)),
  );
  const [attempted, setAttempted] = useState(false);
  const inFlight = useRef(false);
  const alreadyAccepted = review.ownRegistration?.status === "ACCEPTED";
  const complete =
    alreadyAccepted ||
    ((!review.requiresAvailability ||
      (eventOptionVotesAreComplete(event.dates, dateVotes) &&
        eventOptionVotesAreComplete(event.locations, locationVotes))) &&
      eventOptionVotesAreComplete(gameOptions, gameVotes));
  const settingsReady =
    alreadyAccepted ||
    (event.dates.length > 0 && event.locations.length > 0 && table.games.length > 0);
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: event.timeZone,
      }),
    [i18n.locale, event.timeZone],
  );
  const submit = async () => {
    if (inFlight.current) return;
    if (!complete) {
      setAttempted(true);
      return;
    }
    inFlight.current = true;
    try {
      await onClaim({
        consent: true,
        ...(alreadyAccepted
          ? {}
          : {
              participation: {
                version: event.version,
                gameVotes: eventVotingChoices(gameOptions, gameVotes),
                ...(review.requiresAvailability
                  ? {
                      availability: {
                        version: event.version,
                        dateVotes: eventVotingChoices(event.dates, dateVotes),
                        locationVotes: eventVotingChoices(event.locations, locationVotes),
                      },
                    }
                  : {}),
              },
            }),
      });
    } catch {
      // The shared mutation exposes its authoritative failure; keep the reviewed choices for retry.
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <InviteShell title={i18n._(messages.tableTitle)}>
      <div>
        <strong>{review.group.name}</strong>
        <p>
          {event.name} · {table.name}
        </p>
      </div>
      <p>
        {i18n._({
          ...messages.tableConsent,
          values: {
            inviter: formatUsername(review.inviter.username, review.inviter.name),
            group: review.group.name,
            table: table.name,
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
      {attempted && !complete ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          {i18n._(messages.validation)}
        </p>
      ) : null}
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
        isDisabled={busy || disabled || !settingsReady}
        onPress={() => void submit()}
      >
        {i18n._(busy ? messages.accepting : messages.accept)}
      </Button>
    </InviteShell>
  );
}
