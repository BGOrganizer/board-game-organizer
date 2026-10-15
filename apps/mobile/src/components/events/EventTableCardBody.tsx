import type { EventDraftTable } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  Armchair,
  Clock3,
  Dices,
  LayoutGrid,
  LockKeyhole,
  Presentation,
  Trophy,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";

export function EventTableCardBody({
  table,
  timeZone,
  gameName,
  demonstrator,
  confirmedCount,
  reservedCount,
}: {
  table: EventDraftTable["input"];
  timeZone: string;
  gameName: string;
  imageUrl?: string | null;
  demonstrator?: { username?: string | null; name?: string | null } | null;
  confirmedCount?: number;
  reservedCount?: number;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const [foreground, muted] = useThemeColor(["foreground", "muted"]);
  const dates = new Intl.DateTimeFormat(i18n.locale, { timeStyle: "short", timeZone });
  const fields = [
    { Icon: Clock3, label: t("Start time"), value: dates.format(new Date(table.startsAt)) },
    { Icon: Clock3, label: t("End time"), value: dates.format(new Date(table.endsAt)) },
    { Icon: Dices, label: t("Board games"), value: gameName },
  ];
  const playerFields = [
    { Icon: Armchair, label: t("Players"), value: `${table.minPlayers}–${table.maxPlayers}` },
    ...(confirmedCount !== undefined
      ? [{ Icon: UsersRound, label: t("confirmed players"), value: String(confirmedCount) }]
      : []),
    ...(reservedCount !== undefined
      ? [{ Icon: LockKeyhole, label: t("reserved places"), value: String(reservedCount) }]
      : []),
  ];
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 80, height: 80, flexShrink: 0 }}>
        <AnimatedDicebearArtwork seed={table.name} variant="shapes" size={80} />
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {playerFields.map(({ Icon, label, value }) => (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon size={16} color={muted} accessible={false} />
              <Typography
                accessibilityLabel={`${label}: ${value}`}
                className="text-sm text-foreground"
              >
                {value}
              </Typography>
            </View>
          ))}
        </View>
        {demonstrator ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <Presentation size={16} color={muted} accessible={false} />
            <Typography
              className="text-sm text-foreground"
              style={{ flex: 1 }}
              accessibilityLabel={`${t("Demonstrator")}: ${demonstrator.username ?? demonstrator.name ?? t("Username unavailable")}`}
            >
              {demonstrator.username ?? demonstrator.name ?? t("Username unavailable")}
            </Typography>
          </View>
        ) : null}
      </ListCardBody>
    </View>
  );
}
