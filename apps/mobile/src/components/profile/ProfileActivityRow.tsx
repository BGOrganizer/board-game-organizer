import type { ProfileActivity } from "@board-game-organizer/schemas";
import { profileActivityRelativeTime } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  Dices,
  Handshake,
  Trophy,
  UserRoundPlus,
  UsersRound,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useT } from "@/lib/i18n";
import { notificationHref } from "@/lib/notifications/push-notifications";

export function ProfileActivityRow({ item }: { item: ProfileActivity }) {
  const t = useT(),
    { i18n } = useLingui(),
    muted = useThemeColor("muted"),
    router = useRouter();
  const labels = {
    played: t("Game played"),
    friendship: t("New friendship"),
    event_join: t("Joined an event"),
    table_join: t("Joined a table"),
    group_join: t("Joined a group"),
    follower: t("New follower"),
    milestone: t("Victory milestone"),
  };
  const icons = {
    played: Dices,
    friendship: Handshake,
    event_join: CalendarDays,
    table_join: Dices,
    group_join: UsersRound,
    follower: UserRoundPlus,
    milestone: Trophy,
  };
  const Icon = icons[item.kind],
    Identity = item.href ? Pressable : View;
  return (
    <GroupedRow>
      <Identity
        accessibilityRole={item.href ? "button" : undefined}
        accessibilityLabel={item.href ? `${labels[item.kind]}: ${item.context ?? ""}` : undefined}
        onPress={item.href ? () => router.push(notificationHref({ href: item.href })) : undefined}
        style={{ minHeight: 44, flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <Icon size={20} color={muted} accessible={false} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Typography className="font-medium text-foreground">
            {labels[item.kind]}
            {item.kind === "played"
              ? ` · ${item.outcome === "won" ? t("Won") : t("Completed")}`
              : item.milestone
                ? ` · ${new Intl.NumberFormat(i18n.locale).format(item.milestone)}`
                : ""}
          </Typography>
          {item.context ? (
            <Typography className="text-sm text-muted" numberOfLines={2}>
              {item.context}
            </Typography>
          ) : null}
          <Typography className="text-xs text-muted">
            {profileActivityRelativeTime(item.occurredAt, (id, values) => i18n._({ id, values }))}
          </Typography>
        </View>
      </Identity>
    </GroupedRow>
  );
}
