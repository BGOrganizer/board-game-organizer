import type { ClientEventRecord } from "@board-game-organizer/shared";
import { Typography } from "heroui-native/text";
import { Dices, Info, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { useT } from "@/lib/i18n";
import { EventPlanningSettingsSummary } from "./EventPlanningSettingsSummary";
import { EventVoteLegendContent } from "./EventVoteLegendContent";

export function EventSectionHeader({
  event,
  section,
  voteDates = false,
  voteLocations = false,
}: {
  event: ClientEventRecord;
  section: "details" | "participants" | "tables";
  voteDates?: boolean;
  voteLocations?: boolean;
}) {
  const t = useT();
  const sections = {
    details: {
      title: t("Details"),
      label: t("Event details help"),
      icon: Info,
      help: t("To join the event, open Tables, choose a table and sign up."),
    },
    participants: {
      title: t("Participants"),
      label: t("Event participants help"),
      icon: UsersRound,
      help: t(
        "Players with a seat or a waiting-list place at one or more event tables appear here.",
      ),
    },
    tables: {
      title: t("Tables"),
      label: t("Event tables help"),
      icon: Dices,
      help: t("To take part in the event, register for at least one table."),
    },
  };
  const { title, label, icon: Icon, help } = sections[section];
  const canExplainProposals =
    section === "details" &&
    event.status === "PLANNING" &&
    event.groupType !== "PUBLIC" &&
    !event.readOnly;
  const singleOptionVotes =
    Number(voteDates && event.dateVoteRequired === true) +
    Number(voteLocations && event.locationVoteRequired === true);
  const votingCategories = Number(voteDates) + Number(voteLocations);
  return (
    <HelpSectionCard title={title} label={label} icon={Icon}>
      <Typography className="text-foreground">
        {event.status === "PLANNING"
          ? help
          : t(
              "Only players with confirmed seats at tables that reached the minimum player count and met the event requirements take part.",
            )}
      </Typography>
      {section === "details" && !event.personalAccessOnly && !event.sharedResultsOnly ? (
        <View style={{ gap: 4 }}>
          <Typography className="font-semibold text-foreground">{t("Settings")}</Typography>
          <EventPlanningSettingsSummary event={event} />
        </View>
      ) : null}
      {section === "details" && (voteDates || voteLocations) ? (
        <View style={{ gap: 8 }}>
          <Typography className="font-semibold text-foreground">
            {voteDates && voteLocations
              ? t("Dates, times and locations")
              : voteDates
                ? t("Dates and times")
                : t("Locations")}
          </Typography>
          <EventVoteLegendContent
            scope="event"
            multipleCategories={votingCategories > 1}
            singleOption={
              singleOptionVotes === 0
                ? undefined
                : singleOptionVotes === votingCategories
                  ? "only"
                  : "mixed"
            }
          />
        </View>
      ) : null}
      {canExplainProposals && event.allowParticipantDates ? (
        <Typography className="text-foreground">
          {t(
            "Players seated at an event table can propose other dates and times for a manager to approve.",
          )}
        </Typography>
      ) : null}
      {canExplainProposals && event.allowParticipantLocations ? (
        <Typography className="text-foreground">
          {t(
            "Players seated at an event table can propose other locations for a manager to approve.",
          )}
        </Typography>
      ) : null}
    </HelpSectionCard>
  );
}
