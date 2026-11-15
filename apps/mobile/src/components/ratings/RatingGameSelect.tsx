import type { ProfileRatingGame } from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Select } from "heroui-native/select";
import { Typography } from "heroui-native/text";
import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { useT } from "@/lib/i18n";
import { useKeyboardHeight } from "@/lib/useKeyboardHeight";
import { LeaderboardGameCover } from "./LeaderboardGameCover";

export function RatingGameSelect({
  value,
  selectedId,
  games,
  onChange,
  onClose,
  onEndReached,
  children,
  footer,
  empty,
}: {
  value?: ProfileRatingGame | null;
  selectedId: number | null;
  games: readonly ProfileRatingGame[];
  onChange: (id: number | null) => void;
  onClose?: () => void;
  onEndReached?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
}) {
  const t = useT(),
    muted = useThemeColor("muted");
  const keyboardHeight = useKeyboardHeight(),
    insets = useSafeAreaInsets(),
    { height } = useWindowDimensions();
  const listHeight = Math.min(
    320,
    Math.max(80, height - keyboardHeight - insets.top - insets.bottom - 24),
  );
  return (
    <View style={{ gap: 8 }}>
      <Typography className="font-medium text-foreground">{t("Board game")}</Typography>
      <View style={{ position: "relative" }}>
        <Select
          key={selectedId ?? "none"}
          value={
            selectedId !== null
              ? { value: String(selectedId), label: value?.name ?? t("Unknown") }
              : undefined
          }
          onValueChange={(item) => onChange(item ? Number(item.value) : null)}
          onOpenChange={(open) => {
            if (!open) onClose?.();
          }}
        >
          <Select.Trigger
            testID="rating-game-select-trigger"
            accessibilityLabel={value ? `${t("Board game")}: ${value.name}` : t("Board game")}
            style={selectedId !== null ? { paddingRight: 52 } : undefined}
          >
            {value ? <LeaderboardGameCover imageUrl={value.imageUrl} /> : null}
            <Typography
              className={value ? "text-foreground" : "text-muted"}
              style={{ flex: 1 }}
              numberOfLines={1}
            >
              {value?.name ?? (selectedId !== null ? t("Unknown") : t("Select a board game"))}
            </Typography>
            {selectedId === null ? <Select.TriggerIndicator /> : null}
          </Select.Trigger>
          <Select.Portal>
            <Select.Overlay />
            <Select.Content
              testID="rating-game-select-popover"
              presentation="popover"
              width="trigger"
              insets={{ top: insets.top + 8, bottom: insets.bottom + keyboardHeight + 8 }}
              style={{ height: listHeight, maxHeight: listHeight, overflow: "hidden" }}
            >
              <InputFlatList
                testID="rating-game-select-list"
                keyboardAvoidance="external"
                style={{ flex: 1, minHeight: 0, width: "100%" }}
                ListHeaderComponent={<>{children}</>}
                data={games}
                keyExtractor={(game) => String(game.id)}
                keyboardShouldPersistTaps="handled"
                onEndReached={onEndReached}
                ListFooterComponent={<>{footer}</>}
                ListEmptyComponent={
                  <>
                    {empty ?? <Typography className="text-muted">{t("No games found")}</Typography>}
                  </>
                }
                renderItem={({ item }) => (
                  <Select.Item value={String(item.id)} label={item.name}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <LeaderboardGameCover imageUrl={item.imageUrl} />
                      <Typography className="text-foreground" style={{ flex: 1 }} numberOfLines={1}>
                        {item.name}
                      </Typography>
                    </View>
                    <Select.ItemIndicator />
                  </Select.Item>
                )}
              />
            </Select.Content>
          </Select.Portal>
        </Select>
        {selectedId !== null ? (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            accessibilityLabel={t("Clear board game selection")}
            style={{ position: "absolute", right: 2, top: 2, width: 44, height: 44 }}
            onPress={() => onChange(null)}
          >
            <X size={18} color={muted} accessible={false} />
          </Button>
        ) : null}
      </View>
    </View>
  );
}
