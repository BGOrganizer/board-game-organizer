import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import {
  formatUsername,
  groupLeaderboardRoles,
  RECORD_USER_ROLES,
} from "@board-game-organizer/shared";
import { Card } from "heroui-native/card";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  ChartNoAxesColumnIncreasing,
  Clock3,
  Dices,
  Trophy,
  UserRoundX,
} from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { useT } from "@/lib/i18n";

type Player = GroupLeaderboardResponse["players"][number];

export const LeaderboardPlayerCard = memo(function LeaderboardPlayerCard({
  player,
  group,
  format,
}: {
  player: Player;
  group: boolean;
  format: Intl.NumberFormat;
}) {
  const t = useT();
  const [warning, muted, accent] = useThemeColor(["warning", "muted", "accent"]);
  const name = formatUsername(player.username, t("Username unavailable"));
  const roles = groupLeaderboardRoles(player);
  const primary = roles[0];
  const secondary = player.left
    ? t("Former group member")
    : primary
      ? t(RECORD_USER_ROLES[primary].message)
      : null;
  const stats = [
    {
      label: t("Played"),
      full: t("Games played"),
      value: Math.max(0, player.gamesPlayed - player.nd),
      icon: Dices,
      color: muted,
      flex: 1.2,
    },
    {
      label: t("Wins"),
      full: t("Games won"),
      value: player.gamesWon,
      icon: Trophy,
      color: warning,
      flex: 1,
    },
    { label: t("ND"), full: t("ND"), value: player.nd, icon: UserRoundX, color: muted, flex: 0.8 },
  ];
  return (
    <Card
      variant="secondary"
      testID={`group-ranking-player-${player.userId}`}
      style={{ opacity: player.left ? 0.55 : 1, padding: 8, gap: 5 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <UserAvatar
          name={name}
          avatarUrl={player.avatarUrl}
          badgeContent={roles.length ? <UserRoleBadge roles={roles} /> : undefined}
        />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <Typography
              className="text-sm font-semibold text-foreground"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {name}
            </Typography>
            {player.position != null ? (
              <Chip
                size="sm"
                variant="secondary"
                accessibilityLabel={`${t("Position")} #${player.position}`}
              >
                <Chip.Label>#{player.position}</Chip.Label>
              </Chip>
            ) : null}
          </View>
          {secondary ? (
            <Typography className="text-xs text-muted" numberOfLines={1}>
              {secondary}
            </Typography>
          ) : null}
          {group && !player.left && player.groupRole === undefined ? (
            <Skeleton
              accessibilityLabel={t("Loading…")}
              style={{ width: 68, height: 14, borderRadius: 4 }}
            />
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <ChartNoAxesColumnIncreasing size={12} color={accent} accessible={false} />
            <Typography className="text-xs text-muted">OpenSkill</Typography>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {player.provisional ? (
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={t("Provisional rating")}
              >
                <Clock3 size={14} color={warning} />
              </View>
            ) : null}
            <Typography
              className={
                player.rating === null ? "text-xs text-muted" : "font-semibold text-foreground"
              }
            >
              {player.rating === null ? t("Not rated") : format.format(player.rating)}
            </Typography>
          </View>
        </View>
      </View>
      <View
        className="border-separator border-t"
        style={{ flexDirection: "row", gap: 6, paddingTop: 4 }}
      >
        {stats.map(({ label, full, value, icon: Icon, color, flex }) => (
          <View
            key={full}
            accessible
            accessibilityLabel={`${full}: ${value}`}
            style={{
              flex,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              columnGap: 2,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Icon size={12} color={color} accessible={false} />
              <Typography className="text-xs text-muted">{label}</Typography>
            </View>
            <Typography className="text-sm font-semibold text-foreground">{value}</Typography>
          </View>
        ))}
      </View>
    </Card>
  );
});
