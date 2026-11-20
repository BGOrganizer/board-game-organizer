"use client";
import { type EventTableDraft, eventGameDuration } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Dices, Presentation, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { ListCardCoverContent } from "@/components/common/ui/ListCardCoverContent";
import { EventTableGamesPopover } from "./EventTableGamesPopover";
import { EventTableRatingInfo } from "./EventTableRatingInfo";

/** Unsaved local facts only: no persisted status, attendance, navigation or fake IDs. */
export function EventDraftTableCard({
  row,
  publicGroup = false,
}: {
  row: EventTableDraft;
  publicGroup?: boolean;
}) {
  const { t, i18n } = useLingui();
  return (
    <ListCard className="overflow-hidden">
      <ListCardCoverContent
        heading={
          <ListCardBody
            title={row.name}
            titleIcon={<Dices className="size-4 shrink-0 text-muted" aria-hidden />}
          />
        }
        artwork={
          <AnimatedDicebearArtwork seed={row.id ?? row.key} variant="tables" presentation="cover" />
        }
        controls={
          <>
            <HelpPopover
              size="compact"
              label={`${t`Players`}: ${row.name}`}
              title={t`Players`}
              icon={UsersRound}
              triggerClassName="bg-default"
            >
              <p>
                {t`Minimum players`}: {i18n.number(row.minPlayers)}
              </p>
              <p>
                {t`Maximum players`}: {i18n.number(row.maxPlayers)}
              </p>
            </HelpPopover>
            <EventTableRatingInfo enabled={row.rankingEnabled} />
            {publicGroup || row.demonstratorUserId || row.demonstratorGuestName ? (
              <HelpPopover
                size="compact"
                label={`${t`Demonstrator`}: ${row.name}`}
                title={t`Demonstrator`}
                icon={Presentation}
                tone={row.demonstratorUserId || row.demonstratorGuestName ? "accent" : "muted"}
                triggerClassName="bg-default"
              >
                <p>
                  {row.demonstratorGuestName ??
                    (row.demonstratorUserId
                      ? (row.demonstratorName ?? t`Unknown`)
                      : t`No demonstrator`)}
                </p>
              </HelpPopover>
            ) : null}
            <EventTableGamesPopover
              name={row.name}
              games={row.games.map((game) => ({
                ...game,
                durationMinutes: eventGameDuration(game),
              }))}
            />
          </>
        }
      >
        <p className="text-sm tabular-nums text-foreground">
          {t`Minimum players`}: {i18n.number(row.minPlayers)}
          <br />
          {t`Maximum players`}: {i18n.number(row.maxPlayers)}
        </p>
      </ListCardCoverContent>
    </ListCard>
  );
}
