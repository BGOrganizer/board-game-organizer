"use client";

import type {
  EventVote,
  InviteReviewResponse,
  JoinTableInput,
} from "@board-game-organizer/schemas";
import { useMemo, useRef, useState } from "react";
import {
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
    eventVotingChoices(event.dates, explicitVotes(review.ownAvailability?.dateVotes)),
  );
  const [locationVotes, setLocations] = useState<Choices>(() =>
    eventVotingChoices(event.locations, explicitVotes(review.ownAvailability?.locationVotes)),
  );
  const [gameVotes, setGames] = useState<Choices>(() =>
    eventVotingChoices(gameOptions, explicitVotes(review.ownRegistration?.gameVotes)),
  );
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
    complete,
    settingsReady,
    submit,
  };
}
