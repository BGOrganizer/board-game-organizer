"use client";

import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { Button, Input, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Gamepad2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  apiUrl: string;
  token: string | null;
  getToken?: () => Promise<string | null>;
  protectionBypass?: string | null;
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
 * backend (/api/bgg/search). Results are id + name only (fast, rate-limit
 * friendly); image + year are fetched lazily via /api/bgg/thing when a game
 * is selected.
 */
export function SearchGamePage({
  apiUrl,
  token,
  getToken,
  protectionBypass,
  onSelect,
  onClose,
}: Props) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BggSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        if (active) setItems(data.items);
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
  }, [query, apiUrl, token, getToken, protectionBypass, t]);

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
    <div className="mx-auto w-full max-w-md pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">{t`Select a board game`}</h2>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t`Search board games (at least 4 characters)`}
        startContent={<Search className="h-4 w-4 text-default-400" />}
        endContent={
          query ? (
            <button
              type="button"
              aria-label={t`Clear`}
              onClick={() => setQuery("")}
              className="text-default-400 hover:text-default-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null
        }
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
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-default-200 p-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-default-100">
              <Gamepad2 className="h-5 w-5 text-default-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
            </div>
            <Button
              size="sm"
              color="primary"
              isLoading={picking === item.id}
              onPress={() => void select(item)}
            >
              {t`Select`}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
