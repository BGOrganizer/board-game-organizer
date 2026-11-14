import type { MatchLocation } from "@board-game-organizer/schemas";
import { type FavoriteLocationsState, formatLocationAddress } from "@board-game-organizer/shared";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Heart } from "lucide-react-native";
import { Keyboard, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { useT } from "@/lib/i18n";

export function LocationFavoriteSelect({
  favorites,
  selectedKey,
  onSelect,
}: {
  favorites: FavoriteLocationsState;
  selectedKey: string | null;
  onSelect: (key: string, location: MatchLocation) => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [foreground, muted] = useThemeColor(["foreground", "muted"]);
  const selected = favorites.items.find((item) => item.key === selectedKey);
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Heart size={18} color={foreground} />
        <Typography className="font-medium text-foreground">{t("Favorite locations")}</Typography>
      </View>
      {favorites.list.isPending ? (
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 48, borderRadius: 12 }}
        />
      ) : (
        <Select
          presentation="bottom-sheet"
          onOpenChange={(open) => {
            if (open) Keyboard.dismiss();
          }}
          value={selected ? { value: selected.key, label: selected.location.name } : undefined}
          onValueChange={(value) => {
            const item = favorites.items.find((item) => item.key === value?.value);
            if (item) onSelect(item.key, item.location);
          }}
          isDisabled={!favorites.items.length}
        >
          <Select.Trigger
            testID="favorite-location-select"
            accessibilityLabel={t("Favorite locations")}
          >
            <Select.Value
              placeholder={
                favorites.list.isError || favorites.items.length
                  ? t("Select a favorite location")
                  : t("No favorite locations")
              }
            />
            <Select.TriggerIndicator />
          </Select.Trigger>
          <Select.Portal>
            <Select.Overlay />
            <Select.Content
              presentation="bottom-sheet"
              snapPoints={["60%", "85%"]}
              enableDynamicSizing={false}
              bottomInset={insets.bottom}
              topInset={insets.top}
              contentContainerProps={{ style: { flex: 1 } }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Heart size={18} color={foreground} />
                <Select.ListLabel>{t("Favorite locations")}</Select.ListLabel>
              </View>
              <BottomSheetFlatList
                style={{ flex: 1 }}
                data={favorites.items}
                ListEmptyComponent={
                  !favorites.list.isPending && !favorites.list.isError ? (
                    <EmptyList icon={<Heart size={28} color={muted} />}>
                      {t("No favorite locations")}
                    </EmptyList>
                  ) : null
                }
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
                keyExtractor={(item) => item.key}
                onEndReachedThreshold={0.5}
                onEndReached={() => {
                  if (
                    favorites.list.hasNextPage &&
                    !favorites.list.isFetchingNextPage &&
                    !favorites.list.isError
                  )
                    void favorites.list.fetchNextPage();
                }}
                renderItem={({ item, index }) => (
                  <Select.Item
                    testID={`favorite-location-${index}`}
                    value={item.key}
                    label={item.location.name}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Select.ItemLabel />
                      <Select.ItemDescription numberOfLines={2}>
                        {formatLocationAddress(item.location.address)}
                      </Select.ItemDescription>
                    </View>
                    <Select.ItemIndicator />
                  </Select.Item>
                )}
                ListFooterComponent={
                  favorites.list.isFetchingNextPage ? (
                    <Skeleton isLoading style={{ width: "100%", height: 48, borderRadius: 12 }} />
                  ) : favorites.list.isError ? (
                    <View style={{ gap: 8 }}>
                      <Typography accessibilityRole="alert" className="text-danger">
                        {t("Could not load favorite locations")}
                      </Typography>
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={favorites.list.isFetching}
                        onPress={() => {
                          if (favorites.list.isFetchNextPageError)
                            void favorites.list.fetchNextPage();
                          else void favorites.list.refetch();
                        }}
                      >
                        <Button.Label>{t("Retry")}</Button.Label>
                      </Button>
                    </View>
                  ) : null
                }
              />
            </Select.Content>
          </Select.Portal>
        </Select>
      )}
      {favorites.list.isError && (
        <Typography className="text-danger" accessibilityRole="alert">
          {t("Could not load favorite locations")}
        </Typography>
      )}
    </>
  );
}
