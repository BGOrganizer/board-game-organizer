import type { ActivityAuthor, ProfileActivity } from "@board-game-organizer/schemas";
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

export function ActivityRow({ item, author }: { item: ProfileActivity; author?: ActivityAuthor }) {
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
  const Icon = item.kind === "played" && item.outcome === "won" ? Trophy : icons[item.kind],
    Identity = item.href && !author ? Pressable : View;
  return (
    <GroupedRow>
      <Identity
        accessibilityRole={item.href && !author ? "button" : undefined}
        accessibilityLabel={
          item.href && !author ? `${labels[item.kind]}: ${item.context ?? ""}` : undefined
        }
        onPress={
          item.href && !author
            ? () => router.push(notificationHref({ href: item.href }))
            : undefined
        }
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
          {author ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={author.username || author.name || t("Username unavailable")}
                onPress={() => router.push(`/user/${encodeURIComponent(author.id)}`)}
                style={{ minHeight: 44, maxWidth: "100%", justifyContent: "center" }}
              >
                <Typography className="text-sm font-medium text-foreground" numberOfLines={2}>
                  {author.username || author.name || t("Username unavailable")}
                </Typography>
              </Pressable>
              {item.context ? <Typography className="text-sm text-muted">·</Typography> : null}
              {item.href ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${labels[item.kind]}: ${item.context ?? ""}`}
                  onPress={() => router.push(notificationHref({ href: item.href }))}
                  style={{ minHeight: 44, maxWidth: "100%", justifyContent: "center" }}
                >
                  <Typography className="text-sm font-medium text-foreground" numberOfLines={2}>
                    {item.context || labels[item.kind]}
                  </Typography>
                </Pressable>
              ) : item.context ? (
                <Typography className="text-sm font-medium text-foreground" numberOfLines={2}>
                  {item.context}
                </Typography>
              ) : null}
            </View>
          ) : item.context ? (
            <Typography className="text-sm font-medium text-foreground" numberOfLines={2}>
              {item.context}
            </Typography>
          ) : null}
          {item.eventContext ? (
            <Typography className="text-xs text-muted" numberOfLines={2}>
              {item.eventContext}
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
