import type { ContactUser } from "@board-game-organizer/shared";
import { Typography } from "heroui-native/text";
import { Ban, UserRoundCheck, UserRoundPlus, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { IconBadge } from "./IconBadge";

export function UserRelationshipBadge({
  user,
}: {
  user: Pick<ContactUser, "id" | "blockedByMe" | "isFriend" | "isFollowing" | "isFollower">;
}) {
  const t = useT();
  const facts = [
    user.blockedByMe && {
      icon: Ban,
      color: "danger" as const,
      label: t("Blocked"),
      description: t("People you have blocked."),
    },
    user.isFriend && {
      icon: UsersRound,
      color: "accent" as const,
      label: t("Friends"),
      description: t("Friendship accepted."),
    },
    user.isFollowing && {
      icon: UserRoundPlus,
      color: "warning" as const,
      label: t("Following"),
      description: t("People you follow."),
    },
    user.isFollower && {
      icon: UserRoundCheck,
      color: "success" as const,
      label: t("Followers"),
      description: t("People who follow you."),
    },
  ].filter((fact) => fact !== false && fact !== undefined);
  const first = facts[0];
  if (!first) return null;
  return (
    <IconBadge
      icon={first.icon}
      color={first.color}
      label={facts.map((fact) => fact.label).join(" · ")}
      title={t("Connections")}
      multiple={facts.length > 1}
    >
      <View style={{ gap: 8 }}>
        {facts.map((fact) => (
          <View key={fact.label}>
            <Typography className="font-medium text-foreground">{fact.label}</Typography>
            <Typography className="text-foreground">{fact.description}</Typography>
          </View>
        ))}
      </View>
    </IconBadge>
  );
}
