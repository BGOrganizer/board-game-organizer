import type { MatchLocation } from "@board-game-organizer/schemas";
import type { FavoriteLocationsState } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Heart } from "lucide-react-native";
import { useT } from "@/lib/i18n";

export function LocationFavoriteButton({
  location,
  favorites,
  matchId,
}: {
  location: MatchLocation;
  favorites: FavoriteLocationsState;
  matchId?: string;
}) {
  const t = useT();
  const [foreground, accent] = useThemeColor(["foreground", "accent"]);
  const favorite = favorites.isFavorite(location);
  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      style={{ width: 44, height: 44 }}
      accessibilityLabel={
        favorite ? t("Remove location from favorites") : t("Add location to favorites")
      }
      accessibilityState={{ selected: favorite }}
      isDisabled={
        favorites.toggle.isPending ||
        favorites.status.isPending ||
        (favorites.status.isError && !favorites.status.data)
      }
      onPress={() => favorites.toggle.mutate({ location, favorite, matchId })}
    >
      <Heart size={20} color={favorite ? accent : foreground} fill={favorite ? accent : "none"} />
    </Button>
  );
}
