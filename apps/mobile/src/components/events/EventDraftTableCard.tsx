import type { EventTableDraft } from "@board-game-organizer/shared";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Gamepad2, Presentation, Trophy, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";

export function EventDraftTableCard({ row }: { row: EventTableDraft }) {
  const t = useT();
  const [muted, success] = useThemeColor(["muted", "success"]);
  return (
    <ListCard>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 16 }}>
        <View
          className="bg-surface-secondary"
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Gamepad2 size={32} color={muted} accessible={false} />
        </View>
        <ListCardBody
          title={row.name}
          titleAccessory={
            <Chip
              size="sm"
              color={row.rankingEnabled ? "success" : "default"}
              variant="soft"
              style={{
                flexShrink: 0,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Trophy size={14} color={row.rankingEnabled ? success : muted} accessible={false} />
              <Chip.Label numberOfLines={1} style={{ paddingEnd: 2 }}>
                {row.rankingEnabled ? t("Rated") : t("Unrated")}
              </Chip.Label>
            </Chip>
          }
        >
          <Typography className="text-foreground" numberOfLines={2}>
            {row.games.map((game) => game.name).join(", ")}
          </Typography>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <UsersRound size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-muted" style={{ flex: 1 }}>
              {t("Minimum players")}: {row.minPlayers} · {t("Maximum players")}: {row.maxPlayers}
            </Typography>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Presentation size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-muted" style={{ flex: 1 }}>
              {row.demonstratorUserId
                ? (row.demonstratorName ?? t("Unknown"))
                : t("No demonstrator")}
            </Typography>
          </View>
        </ListCardBody>
      </View>
    </ListCard>
  );
}
