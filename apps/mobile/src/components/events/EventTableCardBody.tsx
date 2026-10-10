import type { EventDraftTable } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Clock3, Dices, LayoutGrid, Presentation, Trophy, UsersRound } from "lucide-react-native";
import { Image, View } from "react-native";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";

export function EventTableCardBody({
  table,
  timeZone,
  gameName,
  imageUrl,
  demonstrator,
}: {
  table: EventDraftTable["input"];
  timeZone: string;
  gameName: string;
  imageUrl?: string | null;
  demonstrator?: { username?: string | null; name?: string | null } | null;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const [foreground, muted] = useThemeColor(["foreground", "muted"]);
  const dates = new Intl.DateTimeFormat(i18n.locale, { timeStyle: "short", timeZone });
  const fields = [
    { Icon: Clock3, label: t("Start time"), value: dates.format(new Date(table.startsAt)) },
    { Icon: Clock3, label: t("End time"), value: dates.format(new Date(table.endsAt)) },
    { Icon: Dices, label: t("Board games"), value: gameName },
    { Icon: UsersRound, label: t("Players"), value: `${table.minPlayers}–${table.maxPlayers}` },
    ...(demonstrator
      ? [
          {
            Icon: Presentation,
            label: t("Demonstrator"),
            value: demonstrator.username ?? demonstrator.name ?? t("Username unavailable"),
          },
        ]
      : []),
  ];
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 80, height: 80, flexShrink: 0 }}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            resizeMode="contain"
            accessibilityLabel={gameName}
            style={{ width: 80, height: 80, borderRadius: 12 }}
          />
        ) : (
          <View style={{ width: 80, height: 80, alignItems: "center", justifyContent: "center" }}>
            <Dices size={36} color={muted} />
          </View>
        )}
        {table.openSkill ? (
          <View
            accessible
            accessibilityLabel={t("Global ratings enabled")}
            className="bg-surface rounded-full"
            style={{ position: "absolute", bottom: -4, right: -4, padding: 4 }}
          >
            <Trophy size={16} color={foreground} accessible={false} />
          </View>
        ) : null}
      </View>
      <ListCardBody title={table.name} titleAccessory={<LayoutGrid size={18} color={muted} />}>
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
  );
}
