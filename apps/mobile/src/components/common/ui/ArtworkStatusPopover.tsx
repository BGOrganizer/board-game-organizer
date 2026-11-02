import type { ParticipationIndicator, PendingAction } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Clock3,
  Crown,
  ListOrdered,
  Mail,
  UserRoundCheck,
  UserRoundPlus,
} from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { HelpPopover } from "./HelpPopover";

/** A list-card action, outside its navigation pressable. Unknown seats are never guessed. */
export function ArtworkStatusPopover({
  kind,
  label,
  action,
}: {
  kind: ParticipationIndicator | "admin" | "member" | undefined;
  label?: string;
  action?: PendingAction | null;
}) {
  const t = useT();
  const warning = useThemeColor("warning-soft-foreground");
  if (kind === undefined && !action)
    return (
      <Skeleton
        accessibilityLabel={t("Loading…")}
        style={{ width: 44, height: 44, borderRadius: 12 }}
      />
    );
  const states = {
    confirmed: {
      icon: UserRoundCheck,
      label: t("Confirmed player"),
      description: t("You have a confirmed place at a table."),
    },
    request: {
      icon: Clock3,
      label: t("Participation requested"),
      description: t("Your request is awaiting approval."),
    },
    invitation: {
      icon: Mail,
      label: t("Invitation received"),
      description: t("You have received an invitation."),
    },
    waiting: {
      icon: ListOrdered,
      label: t("Waiting list"),
      description: t("You are on the waiting list, not assigned a place."),
    },
    admin: { icon: Crown, label: t("Administrator"), description: t("You administer this item.") },
    member: {
      icon: UserRoundCheck,
      label: t("Group member"),
      description: t("You are a member of this group."),
    },
  };
  const state = states[kind ?? "invitation"];
  const title = label ?? state.label;
  const actionLabel = action === "review" ? t("Requests to review") : t("Reply required");
  const ActionIcon = action === "review" ? UserRoundPlus : Mail;
  return (
    <HelpPopover
      label={action ? `${title} · ${actionLabel}` : title}
      title={title}
      icon={state.icon}
      tone={kind === "confirmed" || kind === "member" ? "success" : "warning"}
      indicator={
        action && state.icon !== ActionIcon ? (
          <View
            pointerEvents="none"
            className="bg-surface"
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActionIcon size={12} color={warning} accessible={false} />
          </View>
        ) : undefined
      }
    >
      <Typography className="text-foreground">{state.description}</Typography>
      {action ? (
        <Typography className="text-foreground" style={{ marginTop: 8 }}>
          {action === "review"
            ? t("Open Members to approve or reject membership requests.")
            : t("Open details to accept or decline your invitation.")}
        </Typography>
      ) : null}
    </HelpPopover>
  );
}
