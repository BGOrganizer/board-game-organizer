"use client";

import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Gamepad2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GroupedList, GroupedRow } from "@/components/GroupedList";

interface Props {
  apiUrl: string;
  token: string | null;
  getToken?: () => Promise<string | null>;
  protectionBypass?: string | null;
  /** Game ids already picked in other wizard slots — hidden from results. */
  excludeIds?: number[];
  onSelect: (game: {
    id: number;
    name: string;
    imageUrl: string | null;
    year: number | null;
  }) => void;
  onClose: () => void;
}

/**
 * Board-game picker page (wizard step 3). Searches the BGG API through our
 * backend (/api/bgg/search). Cached covers and years accompany results;
 * selection resolves the full image via /api/bgg/thing.
 */
export function SearchGamePage({
  apiUrl,
  token,
  getToken,
  protectionBypass,
  excludeIds = [],
  onSelect,
  onClose,
}: Props) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BggSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  // Search fires only at >= 4 chars.
  useEffect(() => {
    if (query.trim().length < 4) {
      setItems([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const t = getToken ? ((await getToken()) ?? token) : token;
        if (!t) return;
        const res = await fetch(
          withProtectionBypass(
            `${apiUrl}/api/bgg/search?query=${encodeURIComponent(query.trim())}`,
            protectionBypass,
          ),
          { headers: { Authorization: `Bearer ${t}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: BggSearchItem[] };
        // A game already picked in another slot stays hidden: it can only
        // be played once in a match.
        if (active) setItems(data.items.filter((i) => !excludeSet.has(i.id)));
      } catch {
        if (active) setError(t`Search failed`);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, apiUrl, token, getToken, protectionBypass, t, excludeSet]);

  const select = async (item: BggSearchItem) => {
    setPicking(item.id);
    setError(null);
    try {
      const t = getToken ? ((await getToken()) ?? token) : token;
      if (!t) return;
      const res = await fetch(
        withProtectionBypass(`${apiUrl}/api/bgg/thing?id=${item.id}`, protectionBypass),
        { headers: { Authorization: `Bearer ${t}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const details = (await res.json()) as BggThingResponse;
      onSelect({
        id: details.id,
        name: details.name,
        imageUrl: details.imageUrl,
        year: details.year,
      });
    } catch {
      setError(t`Could not load game details`);
    } finally {
      setPicking(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">{t`Select a board game`}</h2>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t`Search board games (at least 4 characters)`}
        aria-label={t`Search board games`}
        className="w-full rounded-lg border border-default-200 bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      />

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {loading && (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      )}
      {!loading && items.length === 0 && query.trim().length >= 4 && (
        <p className="mt-3 text-sm text-default-500">{t`No games found`}</p>
      )}
      <GroupedList className="mt-3">
        {items.map((item) => (
          <GroupedRow key={item.id}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-100">
              {item.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: BGG cover URLs are discovered at runtime.
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Gamepad2 className="h-5 w-5 text-default-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              {item.year ? <p className="text-xs text-default-500">{item.year}</p> : null}
            </div>
            <Button
              isIconOnly
              className="shrink-0"
              size="sm"
              variant="primary"
              aria-label={`${t`Select`}: ${item.name}`}
              isDisabled={picking === item.id}
              onPress={() => void select(item)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </GroupedRow>
        ))}
      </GroupedList>
    </div>
  );
}
