import type { BggSearchItem } from "@board-game-organizer/schemas";
import {
  gameBestPlayersWithPercentage,
  gameDifficultyColor,
  gameMetadataMissing,
  mergeBggGameMetadata,
  useBggGameMetadata,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  Clock,
  Gauge,
  Info,
  ListOrdered,
  Star,
  UsersRound,
} from "lucide-react-native";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function GameCatalogMetadata({
  game,
  name,
  visible,
  size,
}: {
  game: BggSearchItem;
  name: string;
  visible: boolean;
  size?: "sm" | "md";
}) {
  return visible && gameMetadataMissing(game) ? (
    <GameMetadataLookup game={game} name={name} size={size} />
  ) : (
    <GameMetadataBadge game={game} name={name} loading={gameMetadataMissing(game)} size={size} />
  );
}

function GameMetadataLookup({
  game,
  name,
  size,
}: {
  game: BggSearchItem;
  name: string;
  size?: "sm" | "md";
}) {
  const query = useBggGameMetadata(useCommunityApi(), game, true);
  return (
    <GameMetadataBadge
      game={mergeBggGameMetadata(game, query.data)}
      name={name}
      loading={query.isFetching}
      retry={query.isError ? () => void query.refetch() : undefined}
      size={size}
    />
  );
}

function GameMetadataBadge({
  game,
  name,
  loading,
  retry,
  size,
}: {
  game: BggSearchItem;
  name: string;
  loading: boolean;
  retry?: () => void;
  size?: "sm" | "md";
}) {
  const t = useT();
  const { i18n } = useLingui();
  const { height } = useWindowDimensions();
  const [accent, warning, separator] = useThemeColor(["accent", "warning", "separator"]);
  const weightColor = useThemeColor(gameDifficultyColor(game.averageWeight) ?? "muted");
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const rating = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percent = new Intl.NumberFormat(i18n.locale, { style: "percent" });
  const best = gameBestPlayersWithPercentage(game.suggestedPlayers)
    .map(({ count, fraction }) => `${count} (${percent.format(fraction)})`)
    .join(" – ");
  const min = game.minPlayMinutes ?? game.maxPlayMinutes;
  const max = game.maxPlayMinutes ?? min;
  const rows = [
    { Icon: CalendarDays, label: t("Year"), value: game.year || undefined },
    {
      Icon: Star,
      label: t("BGG rating"),
      value: game.average == null ? undefined : rating.format(game.average),
      color: warning,
      fill: warning,
    },
    {
      Icon: ListOrdered,
      label: t("Ranking"),
      value:
        game.rank == null
          ? undefined
          : game.rank === 0
            ? t("Unranked")
            : `#${number.format(game.rank)}`,
      color: warning,
    },
    {
      Icon: Clock,
      label: t("Duration"),
      value:
        min == null
          ? undefined
          : min === max
            ? `${number.format(min)} min`
            : `${number.format(min)}–${number.format(max ?? min)} min`,
    },
    { Icon: UsersRound, label: t("Best BGG"), value: best || undefined },
    {
      Icon: Gauge,
      label: t("Difficulty"),
      value: game.averageWeight == null ? undefined : `${number.format(game.averageWeight)}/5`,
      color: weightColor,
    },
  ];
  return (
    <IconBadge
      icon={Info}
      color="accent"
      size={size}
      label={`${t("Game information")}: ${name}`}
      title={name}
    >
      <ScrollView
        style={{ maxHeight: height * 0.6 }}
        contentContainerStyle={{ gap: 8, paddingTop: 8 }}
        accessibilityState={{ busy: loading }}
      >
        {rows.map(({ Icon, label, value, color, fill }) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon size={15} color={color ?? accent} fill={fill ?? "none"} accessible={false} />
            <Typography className="text-sm font-semibold text-foreground">{label}:</Typography>
            {value == null && loading ? (
              <Skeleton style={{ width: 64, height: 16, borderRadius: 4 }} />
            ) : (
              <Typography className="text-sm text-foreground" style={{ flexShrink: 1 }}>
                {value ?? t("N/A")}
              </Typography>
            )}
          </View>
        ))}
        {game.categories?.length ? (
          <View
            accessibilityLabel={t("BGG categories")}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 4,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: separator,
            }}
          >
            {game.categories.map((category) => (
              <Chip size="sm" color="accent" variant="soft" key={category}>
                <Chip.Label>{category}</Chip.Label>
              </Chip>
            ))}
          </View>
        ) : game.categories === undefined && loading ? (
          <Skeleton style={{ width: 112, height: 20, borderRadius: 10 }} />
        ) : null}
        {retry ? (
          <View style={{ gap: 8 }}>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load game information")}
            </Typography>
            <Button variant="secondary" size="sm" onPress={retry}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </IconBadge>
  );
}
