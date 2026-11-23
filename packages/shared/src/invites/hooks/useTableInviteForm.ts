"use client";

import type {
  EventVote,
  InviteReviewResponse,
  JoinTableInput,
} from "@board-game-organizer/schemas";
import { useMemo, useRef, useState } from "react";
import {
  eventJoinAvailabilityIsComplete,
  eventOptionsRequireVote,
  eventOptionVotesAreComplete,
  eventVotingChoices,
} from "../../events/eventJoinAvailability";
import type { InviteClaimInput } from "./useInviteClaim";
import type { ClaimResult } from "./useInvites";

type Review = Extract<InviteReviewResponse, { kind: "TABLE" }>;
type Choices = JoinTableInput["gameVotes"];
function explicitVotes(choices: Readonly<Record<string, EventVote>> | undefined): Choices {
  return Object.fromEntries(
    Object.entries(choices ?? {}).filter(([, vote]) => vote !== "UNKNOWN"),
  ) as Choices;
}

/** Mount under the API/account/token and reviewed versions key on both platforms. */
export function useTableInviteForm(
  review: Review,
  disabled: boolean,
  onClaim: (input: InviteClaimInput & { consent: true }) => Promise<ClaimResult>,
) {
  const { event, table } = review;
  const gameOptions = useMemo(
    () => table.games.map((game) => ({ id: String(game.gameId) })),
    [table.games],
  );
  const [dateVotes, setDates] = useState<Choices>(() =>
    eventVotingChoices(
      event.dates,
      explicitVotes(review.ownAvailability?.dateVotes),
      event.dateVoteRequired,
    ),
  );
  const [locationVotes, setLocations] = useState<Choices>(() =>
    eventVotingChoices(
      event.locations,
      explicitVotes(review.ownAvailability?.locationVotes),
      event.locationVoteRequired,
    ),
  );
  const [gameVotes, setGames] = useState<Choices>(() =>
    eventVotingChoices(
      gameOptions,
      explicitVotes(review.ownRegistration?.gameVotes),
      table.gameVoteRequired,
    ),
  );
  const inFlight = useRef(false);
  const alreadyAccepted = review.ownRegistration?.status === "ACCEPTED";
  const canVoteDates =
    !alreadyAccepted &&
    review.requiresAvailability &&
    eventOptionsRequireVote(event.dates, event.dateVoteRequired);
  const canVoteLocations =
    !alreadyAccepted &&
    review.requiresAvailability &&
    eventOptionsRequireVote(event.locations, event.locationVoteRequired);
  const canVoteGames =
    !alreadyAccepted && eventOptionsRequireVote(gameOptions, table.gameVoteRequired);
  const complete =
    alreadyAccepted ||
    ((!review.requiresAvailability ||
      eventJoinAvailabilityIsComplete(event, { dateVotes, locationVotes })) &&
      eventOptionVotesAreComplete(gameOptions, gameVotes, table.gameVoteRequired));
  const settingsReady =
    alreadyAccepted ||
    (event.dates.length > 0 && event.locations.length > 0 && table.games.length > 0);
  const submit = async () => {
    if (disabled || !settingsReady || !complete || inFlight.current) return;
    inFlight.current = true;
    try {
      await onClaim({
        consent: true,
        ...(alreadyAccepted
          ? {}
          : {
              participation: {
                version: event.version,
                gameVotes: eventVotingChoices(gameOptions, gameVotes, table.gameVoteRequired),
                ...(review.requiresAvailability
                  ? {
                      availability: {
                        version: event.version,
                        dateVotes: eventVotingChoices(
                          event.dates,
                          dateVotes,
                          event.dateVoteRequired,
                        ),
                        locationVotes: eventVotingChoices(
                          event.locations,
                          locationVotes,
                          event.locationVoteRequired,
                        ),
                      },
                    }
                  : {}),
              },
            }),
      });
    } catch {
      // The authoritative mutation exposes failures and retains choices for an explicit retry.
    } finally {
      inFlight.current = false;
    }
  };
  return {
    dateVotes,
    locationVotes,
    gameVotes,
    setDates,
    setLocations,
    setGames,
    alreadyAccepted,
    canVoteDates,
    canVoteLocations,
    canVoteGames,
    complete,
    settingsReady,
    submit,
  };
}
