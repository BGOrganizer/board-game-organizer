import { type EventTableDraft, eventGameDuration } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Dices, Presentation, UsersRound } from "lucide-react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { ListCardCoverContent } from "@/components/common/ui/ListCardCoverContent";
import { useT } from "@/lib/i18n";
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
  const t = useT(),
    { i18n } = useLingui(),
    muted = useThemeColor("muted");
  return (
    <ListCard style={{ overflow: "hidden" }}>
      <ListCardCoverContent
        artwork={
          <AnimatedDicebearArtwork
            seed={row.id ?? row.key}
            variant="planets"
            presentation="cover"
          />
        }
        controls={
          <>
            <HelpPopover
              size="compact"
              label={`${t("Players")}: ${row.name}`}
              title={t("Players")}
              icon={UsersRound}
              triggerClassName="bg-default"
            >
              <Typography className="text-foreground">
                {t("Minimum players")}: {i18n.number(row.minPlayers)}
              </Typography>
              <Typography className="text-foreground">
                {t("Maximum players")}: {i18n.number(row.maxPlayers)}
              </Typography>
            </HelpPopover>
            <EventTableRatingInfo enabled={row.rankingEnabled} />
            {publicGroup || row.demonstratorUserId ? (
              <HelpPopover
                size="compact"
                label={`${t("Demonstrator")}: ${row.name}`}
                title={t("Demonstrator")}
                icon={Presentation}
                tone={row.demonstratorUserId ? "accent" : "muted"}
                triggerClassName="bg-default"
              >
                <Typography className="text-foreground">
                  {row.demonstratorUserId
                    ? (row.demonstratorName ?? t("Unknown"))
                    : t("No demonstrator")}
                </Typography>
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
        <ListCardBody
          title={row.name}
          titleIcon={<Dices size={16} color={muted} accessible={false} />}
        >
          <Typography className="text-sm text-foreground">
            {t("Minimum players")}: {i18n.number(row.minPlayers)}
            {"\n"}
            {t("Maximum players")}: {i18n.number(row.maxPlayers)}
          </Typography>
        </ListCardBody>
      </ListCardCoverContent>
    </ListCard>
  );
}
