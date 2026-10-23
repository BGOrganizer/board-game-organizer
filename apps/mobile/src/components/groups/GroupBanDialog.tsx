import { eventLocalDateTime, groupBanDeadline } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { Ban } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { EventDateTimeField } from "@/components/events/EventDateTimeField";
import { useT } from "@/lib/i18n";
export function GroupBanDialog({
  name,
  timeZone,
  busy,
  failure,
  onCancel,
  onConfirm,
}: {
  name: string;
  timeZone?: string;
  busy: boolean;
  failure?: string;
  onCancel: () => void;
  onConfirm: (until: string | null) => void;
}) {
  const t = useT(),
    dangerForeground = useThemeColor("danger-foreground");
  const [zone] = useState(() => timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [timed, setTimed] = useState(false),
    [wall, setWall] = useState(() =>
      eventLocalDateTime(new Date(Date.now() + 86400_000).toISOString(), zone),
    ),
    [error, setError] = useState("");
  const submit = () => {
    const until = groupBanDeadline(timed, wall, zone, Date.now());
    if (until === undefined) {
      setError(t("Choose a valid future date and time."));
      return;
    }
    setError("");
    onConfirm(until);
  };
  return (
    <ConfirmDialog
      title={`${t("Ban from group")}: ${name}`}
      description={t(
        "Group exclusion is separate from global blocking. Membership and active registrations are removed; expiry or revocation never restores them. Historical results remain unchanged.",
      )}
      busy={busy}
      onCancel={onCancel}
      actions={[
        {
          label: t("Ban from group"),
          variant: "danger",
          icon: <Ban size={18} color={dangerForeground} />,
          onPress: submit,
        },
      ]}
    >
      <View style={{ gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Typography className="text-foreground">{t("Temporary exclusion")}</Typography>
          <Switch
            accessibilityLabel={t("Temporary exclusion")}
            isSelected={timed}
            isDisabled={busy}
            onSelectedChange={setTimed}
          />
        </View>
        {timed ? (
          <>
            <EventDateTimeField
              label={t("Excluded until")}
              value={wall}
              mode="date"
              timeZone={zone}
              onChange={(day) => setWall(`${day.slice(0, 10)}T${wall.slice(11, 16)}`)}
            />
            <EventDateTimeField
              label={t("Time")}
              value={wall}
              mode="time"
              timeZone={zone}
              day={wall.slice(0, 10)}
              onChange={setWall}
            />
          </>
        ) : null}
        {error || failure ? (
          <Typography accessibilityRole="alert" className="text-danger">
            {error || failure}
          </Typography>
        ) : null}
      </View>
    </ConfirmDialog>
  );
}
