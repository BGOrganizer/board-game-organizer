import {
  type PendingAction,
  RECORD_USER_ROLES,
  type RecordUserRole,
} from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { IdCard } from "lucide-react-native";
import { useWindowDimensions, View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { recordUserRoleIcons } from "@/lib/recordUserRoleIcons";

export function EventRolePopover({
  roles,
  action,
  pending = false,
}: {
  roles: readonly RecordUserRole[];
  action?: PendingAction | null;
  pending?: boolean;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const [warning, accent, success] = useThemeColor([
    "warning-soft-foreground",
    "accent-soft-foreground",
    "success-soft-foreground",
  ]);
  const colors = { warning, accent, success };
  return (
    <HelpPopover
      label={t("Roles and participation")}
      title={t("Roles and participation")}
      icon={IdCard}
      tone="muted"
      size="compact"
      triggerClassName="bg-default"
      width={Math.min(320, width - 32)}
    >
      <View style={{ gap: 8 }}>
        {roles.map((role) => {
          const item = RECORD_USER_ROLES[role],
            Icon = recordUserRoleIcons[item.icon];
          return (
            <View key={role} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Icon
                size={16}
                color={colors[item.tone]}
                accessible={false}
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <Typography className="text-foreground" style={{ flex: 1, minWidth: 0 }}>
                {t(item.message)}
              </Typography>
            </View>
          );
        })}
        {!roles.length ? (
          <Typography className="text-foreground">
            {pending ? t("Loading…") : t("You are not registered.")}
          </Typography>
        ) : null}
        {action ? (
          <Typography className="text-foreground">
            {t("Open details to accept or decline your invitation.")}
          </Typography>
        ) : null}
      </View>
    </HelpPopover>
  );
}
