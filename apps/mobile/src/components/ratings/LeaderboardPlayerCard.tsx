import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import {
  formatUsername,
  groupLeaderboardRoles,
  RECORD_USER_ROLES,
} from "@board-game-organizer/shared";
import { Accordion } from "heroui-native/accordion";
import { Card } from "heroui-native/card";
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
import { RankPositionBadge } from "@/components/common/ui/RankPositionBadge";
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
  const rating = player.rating === null ? t("Not rated") : format.format(player.rating);
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
      testID={`group-ranking-player-${player.userId}`}
      style={{ opacity: player.left ? 0.55 : 1, padding: 0 }}
    >
      <Accordion hideSeparator>
        <Accordion.Item value={player.userId}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingStart: group ? 8 : 16,
              paddingBottom: roles.length ? 8 : 0,
            }}
          >
            <View style={{ minWidth: 24, alignItems: "center" }}>
              {player.position != null ? <RankPositionBadge rank={player.position} /> : null}
            </View>
            <UserAvatar
              name={name}
              avatarUrl={player.avatarUrl}
              badgeContent={roles.length ? <UserRoleBadge roles={roles} /> : undefined}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Typography className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {name}
              </Typography>
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
            <Accordion.Trigger
              testID="ranking-player-statistics-toggle"
              accessibilityLabel={`${name}, OpenSkill ${rating}`}
              accessibilityHint={t("Game statistics")}
              style={{
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: group ? 8 : 12,
                paddingEnd: group ? 8 : 12,
              }}
            >
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
                      player.rating === null
                        ? "text-xs text-muted"
                        : "font-semibold text-foreground"
                    }
                  >
                    {rating}
                  </Typography>
                </View>
              </View>
              <Accordion.Indicator iconProps={{ size: 16, color: muted }} />
            </Accordion.Trigger>
          </View>
          <Accordion.Content
            style={{
              paddingStart: group ? 8 : 16,
              paddingEnd: group ? 8 : 12,
              paddingTop: 0,
              paddingBottom: group ? 8 : 12,
            }}
          >
            <View
              testID="ranking-player-statistics"
              className="border-separator border-t"
              style={{ flexDirection: "row", gap: 6, paddingTop: 8 }}
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
                    <Icon size={16} color={color} accessible={false} />
                    <Typography className="text-sm text-muted">{label}</Typography>
                  </View>
                  <Typography className="text-base font-semibold text-foreground">
                    {value}
                  </Typography>
                </View>
              ))}
            </View>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </Card>
  );
});
