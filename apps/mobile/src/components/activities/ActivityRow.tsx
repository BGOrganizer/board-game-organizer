import type { ActivityAuthor, ProfileActivity } from "@board-game-organizer/schemas";
import { activityNarrative, profileActivityRelativeTime } from "@board-game-organizer/shared";
import { Trans, useLingui } from "@lingui/react";
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
import { View } from "react-native";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useT } from "@/lib/i18n";
import { notificationHref } from "@/lib/notifications/push-notifications";

export function ActivityRow({
  item,
  author,
  viewerId,
}: {
  item: ProfileActivity;
  author?: ActivityAuthor;
  viewerId?: string | null;
}) {
  const t = useT(),
    { i18n } = useLingui(),
    muted = useThemeColor("muted"),
    router = useRouter();
  const story = activityNarrative(item, author, t("Someone"), t("Unavailable source"), {
    id: viewerId,
    name: t("You"),
  });
  const icons = {
    played: Dices,
    friendship: Handshake,
    event_join: CalendarDays,
    table_join: Dices,
    group_join: UsersRound,
    follower: UserRoundPlus,
    milestone: Trophy,
  };
  const Icon = item.kind === "played" && item.outcome === "won" ? Trophy : icons[item.kind];
  const components = Object.fromEntries(
    ["actor", "target"].map((slot) => {
      const person = story[slot as "actor" | "target"];
      return [
        slot,
        <Typography
          key={slot}
          className="text-sm font-medium text-foreground"
          accessibilityRole={person.href ? "link" : undefined}
          onPress={
            person.href ? () => router.push(notificationHref({ href: person.href })) : undefined
          }
        >
          {person.name}
        </Typography>,
      ];
    }),
  );
  return (
    <GroupedRow>
      <Icon size={20} color={muted} accessible={false} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Typography className="text-sm text-foreground">
          <Trans id={story.id} values={{ count: story.count }} components={components} />
        </Typography>
        {item.eventContext ? (
          <Typography className="text-xs text-muted">{item.eventContext}</Typography>
        ) : null}
        <Typography className="text-xs text-muted">
          {profileActivityRelativeTime(item.occurredAt, (id, values) => i18n._({ id, values }))}
        </Typography>
      </View>
    </GroupedRow>
  );
}
