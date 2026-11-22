import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { type EventTablePerson, tablePlayerRatingRows } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Accordion } from "heroui-native/accordion";
import { Card } from "heroui-native/card";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Separator } from "heroui-native/separator";
import { Typography } from "heroui-native/text";
import {
  Clock3,
  Globe,
  Minus,
  TrendingDown,
  TrendingUp,
  Trophy,
  UsersRound,
} from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { useT } from "@/lib/i18n";

export const EventFinishedPlayerResult = memo(function EventFinishedPlayerResult({
  table,
  player,
  name,
}: {
  table: PlannedTableResponse;
  player: EventTablePerson;
  name: string;
}) {
  const t = useT();
  const [muted, warning] = useThemeColor(["muted", "warning-soft-foreground"]);
  const rank = player.rank == null ? t("ND") : `#${player.rank}`;
  const score = player.score ?? t("ND");
  const positionLabel = `${t("Position")}: ${rank}`;
  const scoreLabel = `${t("Score")}: ${score}`;
  const heading = (
    <>
      <UserAvatar
        name={name}
        avatarUrl={player.avatarUrl}
        avatarContent={player.guestName ? <GuestAvatar name={player.guestName} /> : undefined}
        badgeContent={
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={positionLabel}
            pointerEvents="none"
            style={styles.positionSlot}
          >
            <Chip
              size="sm"
              variant="secondary"
              color={player.rank === 1 ? "warning" : "default"}
              disabled
              accessible={false}
              style={styles.position}
            >
              <Chip.Label>{rank}</Chip.Label>
            </Chip>
          </View>
        }
      />
      <View style={styles.identity}>
        <Typography className="font-semibold text-foreground" numberOfLines={1}>
          {name}
        </Typography>
        {player.rank === 1 ? (
          <View style={styles.winner}>
            <Trophy size={12} color={warning} accessible={false} />
            <Typography className="text-xs text-warning-soft-foreground">{t("Winner")}</Typography>
          </View>
        ) : null}
        {player.guestName ? (
          <Typography className="text-xs text-muted">{t("Guest")}</Typography>
        ) : null}
      </View>
      <View style={styles.score} accessible accessibilityLabel={scoreLabel}>
        <Typography className="text-xs text-muted">{t("Score")}</Typography>
        <Typography className="font-semibold text-foreground">{score}</Typography>
      </View>
    </>
  );
  return (
    <Card variant="secondary" style={styles.card}>
      {player.guestName ? (
        <View style={styles.heading}>{heading}</View>
      ) : (
        <Accordion hideSeparator>
          <Accordion.Item value={player.userId}>
            <Accordion.Trigger
              accessibilityLabel={`${name}, ${positionLabel}, ${scoreLabel}`}
              accessibilityHint={t("Rating details")}
              testID={`table-result-rating-${player.userId}`}
              style={styles.heading}
            >
              {heading}
              <Accordion.Indicator iconProps={{ size: 16, color: muted }} />
            </Accordion.Trigger>
            <Accordion.Content
              style={styles.panel}
              testID={`table-result-ratings-${player.userId}`}
            >
              <Separator />
              <RatingBreakdown table={table} userId={player.userId} />
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      )}
    </Card>
  );
});

function RatingBreakdown({ table, userId }: { table: PlannedTableResponse; userId: string }) {
  const t = useT();
  const { i18n } = useLingui();
  const [accent, success, danger, muted, warning] = useThemeColor([
    "accent",
    "success-soft-foreground",
    "danger-soft-foreground",
    "muted",
    "warning-soft-foreground",
  ]);
  const format = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format;
  return tablePlayerRatingRows(table, userId)
    .reverse()
    .map((row) => {
      const group = row.scope === "GROUP";
      const Scope = group ? UsersRound : Globe;
      const { before, after, delta } = row;
      return (
        <View key={row.scope} style={styles.rating}>
          <View style={styles.scope}>
            <View>
              <Scope size={14} color={group ? success : accent} accessible={false} />
              {row.provisional ? (
                <View
                  className="bg-surface-secondary"
                  style={styles.provisional}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t("Provisional rating")}
                >
                  <Clock3 size={10} color={warning} accessible={false} />
                </View>
              ) : null}
            </View>
            <Typography className="text-xs text-muted">
              {group ? t("Group") : t("Global")}
            </Typography>
          </View>
          {before === undefined || after === undefined || delta === undefined ? (
            <Typography className="text-xs text-muted" style={styles.message}>
              {row.state === "notUpdated"
                ? t("Ranking not updated")
                : t("Historical ranking unavailable")}
            </Typography>
          ) : (
            <View style={styles.values}>
              <Typography
                className="text-xs text-muted"
                accessibilityLabel={`${t("Rating before")}: ${format(before)}`}
              >
                {format(before)}
              </Typography>
              <Typography className="text-xs text-muted" accessible={false}>
                →
              </Typography>
              <Typography
                className="text-xs font-semibold text-foreground"
                accessibilityLabel={`${t("Rating after")}: ${format(after)}`}
              >
                {format(after)}
              </Typography>
              <RatingDelta
                delta={delta}
                format={format}
                label={t("Rating change")}
                colors={{ success, danger, muted }}
              />
            </View>
          )}
        </View>
      );
    });
}

function RatingDelta({
  delta,
  format,
  label,
  colors,
}: {
  delta: number;
  format: Intl.NumberFormat["format"];
  label: string;
  colors: { success: string; danger: string; muted: string };
}) {
  const positive = delta > 0;
  const negative = delta < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
  const change = `${positive ? "+" : ""}${format(delta)}`;
  return (
    <View accessible accessibilityLabel={`${label}: ${change}`} pointerEvents="none">
      <Chip
        size="sm"
        variant="soft"
        color={positive ? "success" : negative ? "danger" : "default"}
        disabled
        accessible={false}
        style={styles.delta}
      >
        <Icon
          size={12}
          color={positive ? colors.success : negative ? colors.danger : colors.muted}
          accessible={false}
        />
        <Chip.Label>{change}</Chip.Label>
      </Chip>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  positionSlot: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  position: {
    minHeight: 18,
    minWidth: 21,
    paddingHorizontal: 3,
    paddingVertical: 0,
    justifyContent: "center",
  },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  winner: { flexDirection: "row", alignItems: "center", gap: 2 },
  score: { alignItems: "flex-end", maxWidth: "40%" },
  panel: { paddingHorizontal: 10, paddingTop: 0, paddingBottom: 8, gap: 4 },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 4,
    minHeight: 24,
  },
  scope: { flexDirection: "row", gap: 4, alignItems: "center" },
  provisional: { position: "absolute", right: -2, bottom: -2, borderRadius: 5 },
  message: { flexShrink: 1, textAlign: "right" },
  values: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
  },
  delta: { minHeight: 18, paddingHorizontal: 4, paddingVertical: 0, gap: 3 },
});
