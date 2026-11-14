import { RECORD_USER_ROLES, type RecordUserRole } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  Clock3,
  Crown,
  ListOrdered,
  Mail,
  Presentation,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react-native";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useT } from "@/lib/i18n";
import { IconBadge } from "./IconBadge";

const icons = {
  admin: Crown,
  moderator: ShieldCheck,
  demonstrator: Presentation,
  invitation: Mail,
  request: Clock3,
  waiting: ListOrdered,
  accepted: UserRoundCheck,
};

export function UserRoleBadge({ roles }: { roles: readonly RecordUserRole[] }) {
  const t = useT();
  const { height } = useWindowDimensions();
  const [warning, accent, success] = useThemeColor([
    "warning-soft-foreground",
    "accent-soft-foreground",
    "success-soft-foreground",
  ]);
  const colors = { warning, accent, success };
  const first = roles[0];
  if (!first) return null;
  const primary = RECORD_USER_ROLES[first];
  const labels = roles.map((role) => t(RECORD_USER_ROLES[role].message));
  return (
    <IconBadge
      label={labels.join(" · ")}
      title={t("Roles and participation")}
      icon={icons[primary.icon]}
      color={primary.tone}
      multiple={roles.length > 1}
    >
      <ScrollView
        style={{ maxHeight: Math.min(320, height * 0.5) }}
        contentContainerStyle={{ gap: 8 }}
      >
        {roles.map((role, index) => {
          const item = RECORD_USER_ROLES[role],
            Icon = icons[item.icon];
          return (
            <View key={role} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon size={16} color={colors[item.tone]} accessible={false} />
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {labels[index]}
              </Typography>
            </View>
          );
        })}
      </ScrollView>
    </IconBadge>
  );
}
