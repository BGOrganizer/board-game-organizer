import { notificationItemId, type PlannedTableResponse } from "@board-game-organizer/schemas";
import { canManageEvent, tableParticipation } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Dices, Settings2, UserRoundCheck, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ListCard } from "@/components/common/ui/ListCard";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableRatingBadge } from "./EventTableRatingBadge";

export function EventTableInfo({ table }: { table: PlannedTableResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const { userId } = useCommunityApi();
  const muted = useThemeColor("muted");
  const number = new Intl.NumberFormat(i18n.locale);
  const manager = canManageEvent(table, userId);
  const participation = tableParticipation(table.myRegistration, table.myPosition);
  return (
    <ListCard
      background={
        <AnimatedDicebearArtwork seed={table.id} variant="planets" presentation="background" />
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Settings2 size={16} color={muted} accessible={false} />
        <SearchHelpLabel
          label={t("Settings")}
          helpTitle={t("Field help")}
          help={t(
            "The minimum is required for agreement. The maximum limits reserved places; additional players remain in the waiting queue.",
          )}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 }}>
        <Dices size={20} color={muted} accessible={false} />
        <Typography
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
          style={{ flex: 1, minWidth: 0 }}
        >
          {table.name}
        </Typography>
        <NotificationItem
          itemId={notificationItemId(table.id, "overview", undefined, "table")}
          readOnly
        />
        <EventTableRatingBadge enabled={table.rankingEnabled} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <UserRoundCheck size={16} color={muted} accessible={false} />
          <Typography className="text-sm text-foreground">
            {t("Minimum players")}: {number.format(table.minPlayers)}
          </Typography>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <UsersRound size={16} color={muted} accessible={false} />
          <Typography className="text-sm text-foreground">
            {t("Maximum players")}: {number.format(table.maxPlayers)}
          </Typography>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
        {manager ? <ArtworkStatusPopover kind="manager" /> : null}
        {participation !== null ? (
          <ArtworkStatusPopover kind={participation} />
        ) : !manager ? (
          <ArtworkStatusPopover kind="viewer" />
        ) : null}
        {table.demonstratorUserId && table.demonstratorUserId === userId ? (
          <ArtworkStatusPopover kind="demonstrator" />
        ) : null}
      </View>
      {table.eventStatus !== "PLANNING" && !table.confirmed ? (
        <Typography className="text-sm text-warning">{t("Excluded from confirmation")}</Typography>
      ) : null}
    </ListCard>
  );
}
