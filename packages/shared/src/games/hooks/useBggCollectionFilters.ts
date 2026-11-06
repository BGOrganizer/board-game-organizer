"use client";
import { useState } from "react";
import { useListSearch } from "../../common/hooks/useListSearch";

export type CollectionFilter = "games" | "expansions" | "wishlist" | "common";
const initial: readonly CollectionFilter[] = ["games", "expansions"];
export function useBggCollectionFilters(viewerSnapshot?: string) {
  const search = useListSearch([], 0);
  const [selected, setSelected] = useState(initial);
  const games = selected.includes("games"),
    expansions = selected.includes("expansions");
  return {
    ...search,
    selected: viewerSnapshot ? selected : selected.filter((key) => key !== "common"),
    toggle: (key: CollectionFilter) => {
      if (key === "common" && !viewerSnapshot) return;
      setSelected((old) =>
        old.includes(key) ? old.filter((value) => value !== key) : [...old, key],
      );
    },
    types: games
      ? expansions
        ? ("all" as const)
        : ("games" as const)
      : expansions
        ? ("expansions" as const)
        : ("none" as const),
    wishlist: selected.includes("wishlist"),
    commonSnapshot: selected.includes("common") ? viewerSnapshot : undefined,
  };
}
