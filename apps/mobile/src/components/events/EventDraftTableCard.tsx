import type { EventDraftTable } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  CalendarCheck,
  CalendarClock,
  Dices,
  LayoutGrid,
  Pencil,
  Presentation,
  Trash2,
  UsersRound,
} from "lucide-react-native";
import { Image, View } from "react-native";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";

export function EventDraftTableCard({
  table,
  timeZone,
  busy,
  onEdit,
  onRemove,
}: {
  table: EventDraftTable;
  timeZone: string;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const [foreground, muted, danger] = useThemeColor(["foreground", "muted", "danger"]);
  const dates = new Intl.DateTimeFormat(i18n.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
  const fields = [
    {
      Icon: CalendarClock,
      label: t("Starts at"),
      value: dates.format(new Date(table.input.startsAt)),
    },
    { Icon: CalendarCheck, label: t("Ends at"), value: dates.format(new Date(table.input.endsAt)) },
    { Icon: Dices, label: t("Board games"), value: table.gameName },
    {
      Icon: UsersRound,
      label: t("Players"),
      value: `${table.input.minPlayers}–${table.input.maxPlayers}`,
    },
    ...(table.demonstrator
      ? [
          {
            Icon: Presentation,
            label: t("Demonstrator"),
            value:
              table.demonstrator.username ?? table.demonstrator.name ?? t("Username unavailable"),
          },
        ]
      : []),
  ];
  return (
    <Card style={{ padding: 12, gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        {table.imageUrl ? (
          <Image
            source={{ uri: table.imageUrl }}
            resizeMode="contain"
            accessibilityLabel={table.gameName}
            style={{ width: 80, height: 80, borderRadius: 12 }}
          />
        ) : (
          <View style={{ width: 80, height: 80, alignItems: "center", justifyContent: "center" }}>
            <Dices size={36} color={muted} />
          </View>
        )}
        <ListCardBody
          title={table.input.name}
          titleAccessory={<LayoutGrid size={18} color={muted} />}
        >
          {fields.map(({ Icon, label, value }) => (
            <View key={label} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
              <Icon size={16} color={muted} accessible={false} />
              <Typography
                accessibilityLabel={`${label}: ${value}`}
                className="text-sm text-foreground"
                style={{ flex: 1 }}
              >
                {value}
              </Typography>
            </View>
          ))}
        </ListCardBody>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          isDisabled={busy}
          accessibilityLabel={`${t("Edit table")}: ${table.input.name}`}
          onPress={onEdit}
        >
          <Pencil size={18} color={foreground} />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="danger-soft"
          isDisabled={busy}
          accessibilityLabel={`${t("Remove table")}: ${table.input.name}`}
          onPress={onRemove}
        >
          <Trash2 size={18} color={danger} />
        </Button>
      </View>
    </Card>
  );
}
