"use client";
import type { MatchLocation } from "@board-game-organizer/schemas";
import type { FavoriteLocationsState } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Heart } from "lucide-react";

export function LocationFavoriteButton({
  location,
  favorites,
  matchId,
}: {
  location: MatchLocation;
  favorites: FavoriteLocationsState;
  matchId?: string;
}) {
  const { t } = useLingui();
  const favorite = favorites.isFavorite(location);
  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      aria-label={favorite ? t`Remove location from favorites` : t`Add location to favorites`}
      aria-pressed={favorite}
      isDisabled={
        favorites.toggle.isPending ||
        favorites.status.isPending ||
        (favorites.status.isError && !favorites.status.data)
      }
      onPress={() => favorites.toggle.mutate({ location, favorite, matchId })}
    >
      <Heart
        aria-hidden="true"
        className={favorite ? "size-5 fill-accent text-accent" : "size-5"}
      />
    </Button>
  );
}
