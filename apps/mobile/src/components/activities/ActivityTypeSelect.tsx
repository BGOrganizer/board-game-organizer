import { type ProfileActivityKind, profileActivityKindSchema } from "@board-game-organizer/schemas";
import { Select } from "heroui-native/select";
import { Typography } from "heroui-native/text";
import { useT } from "@/lib/i18n";

export function ActivityTypeSelect({
  value,
  onChange,
}: {
  value?: ProfileActivityKind;
  onChange: (kind?: ProfileActivityKind) => void;
}) {
  const t = useT();
  const labels: Record<ProfileActivityKind, string> = {
    played: t("Game played"),
    friendship: t("New friendship"),
    event_join: t("Joined an event"),
    table_join: t("Joined a table"),
    group_join: t("Joined a group"),
    follower: t("New follower"),
    milestone: t("Victory milestone"),
  };
  const label = value ? labels[value] : t("All activity types");
  return (
    <Select
      value={{ value: value ?? "all", label }}
      onValueChange={(item) => {
        const parsed = profileActivityKindSchema.safeParse(item?.value);
        onChange(parsed.success ? parsed.data : undefined);
      }}
    >
      <Select.Trigger accessibilityLabel={t("Activity type")}>
        <Typography className="text-foreground" style={{ flex: 1 }}>
          {label}
        </Typography>
        <Select.TriggerIndicator />
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content presentation="popover" width="trigger">
          <Select.Item value="all" label={t("All activity types")}>
            <Typography className="text-foreground">{t("All activity types")}</Typography>
            <Select.ItemIndicator />
          </Select.Item>
          {profileActivityKindSchema.options.map((kind) => (
            <Select.Item key={kind} value={kind} label={labels[kind]}>
              <Typography className="text-foreground">{labels[kind]}</Typography>
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
