"use client";

import type { BggPickerItem, BggThingResponse } from "@board-game-organizer/schemas";
import { useBggAccount, useBggPicker, withProtectionBypass } from "@board-game-organizer/shared";
import { Button, Label, SearchField, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Gamepad2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCatalogMetadata } from "@/components/GameCatalogMetadata";
import { GroupedList, GroupedRow } from "@/components/GroupedList";

interface Props {
  apiUrl: string;
  token: string | null;
  getToken?: () => Promise<string | null>;
  userId?: string | null;
  protectionBypass?: string | null;
  excludeIds?: number[];
  onSelect: (game: {
    id: number;
    name: string;
    imageUrl: string | null;
    year: number | null;
    average?: number | null;
    rank?: number | null;
  }) => void;
  onClose: () => void;
}

export function SearchGamePage({
  apiUrl,
  token,
  getToken,
  userId,
  protectionBypass,
  excludeIds = [],
  onSelect,
  onClose,
}: Props) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [search, setSearch] = useState(true);
  const [collection, setCollection] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const freshToken = useCallback(
    async () => (getToken ? ((await getToken()) ?? token) : token),
    [getToken, token],
  );
  const account = useBggAccount({ apiUrl, getToken: freshToken, userId, protectionBypass });
  const hasCollection = Boolean(account.account.data?.active);
  const picker = useBggPicker({
    apiUrl,
    getToken: freshToken,
    userId,
    query: debounced,
    search,
    collection: collection && hasCollection,
    snapshot: account.account.data?.active?.snapshot,
    protectionBypass,
  });
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: page index resets when filters change.
  useEffect(() => setPageIndex(0), [debounced, search, collection, hasCollection]);

  const select = async (item: BggPickerItem) => {
    setPicking(item.id);
    setError(null);
    try {
      const current = await freshToken();
      if (!current) throw new Error("No session token");
      const res = await fetch(
        withProtectionBypass(`${apiUrl}/api/bgg/thing?id=${item.id}`, protectionBypass),
        { headers: { Authorization: `Bearer ${current}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const details = (await res.json()) as BggThingResponse;
      onSelect({
        id: details.id,
        name: details.name,
        imageUrl: details.imageUrl,
        year: details.year,
        average: details.average,
        rank: details.rank,
      });
    } catch {
      setError(t`Could not load game details`);
    } finally {
      setPicking(null);
    }
  };

  const page = picker.data?.pages[pageIndex];
  const items = (page?.items ?? []).filter((item) => !excludeSet.has(item.id));
  return (
    <div className="mx-auto w-full max-w-5xl pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">{t`Select a board game`}</h2>
      </div>
      <SearchField fullWidth value={query} onChange={setQuery}>
        <Label className="sr-only">{t`Search board games`}</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={t`Search board games (at least 4 characters)`} />
          <SearchField.ClearButton aria-label={t`Clear`} />
        </SearchField.Group>
      </SearchField>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          className="h-7 min-h-7 px-2 text-xs"
          style={search ? undefined : { backgroundColor: "#52525b" }}
          aria-pressed={search}
          onPress={() => setSearch((previous) => !previous)}
        >
          <span className="text-white">{t`Search`}</span>
        </Button>
        {hasCollection ? (
          <Button
            size="sm"
            variant="primary"
            className="h-7 min-h-7 px-2 text-xs"
            style={collection ? undefined : { backgroundColor: "#52525b" }}
            aria-pressed={collection}
            onPress={() => setCollection((previous) => !previous)}
          >
            <span className="text-white">{t`Collection`}</span>
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {picker.isError || account.account.isError ? (
        <Button
          className="mt-3"
          variant="outline"
          onPress={() => {
            void account.account.refetch();
            void picker.refetch();
          }}
        >
          {t`Search failed. Retry`}
        </Button>
      ) : null}
      {picker.isPending && ((search && debounced.length >= 4) || (collection && hasCollection)) ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : null}
      {!picker.isPending &&
      !picker.isError &&
      items.length === 0 &&
      (debounced.length >= 4 || (collection && hasCollection)) ? (
        <p className="mt-3 text-sm text-default-500">{t`No games found`}</p>
      ) : null}
      <GroupedList className="mt-3">
        {items.map((item) => (
          <GroupedRow key={item.id}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-100">
              {item.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: BGG cover URLs discovered at runtime.
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Gamepad2 className="h-5 w-5 text-default-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="max-w-[40ch] truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
              <GameCatalogMetadata year={item.year} average={item.average} rank={item.rank} />
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
      {picker.data && (pageIndex > 0 || picker.hasNextPage) ? (
        <nav className="mt-4 flex justify-between" aria-label={t`Game results pages`}>
          <Button
            variant="outline"
            isDisabled={pageIndex === 0}
            onPress={() => setPageIndex((index) => index - 1)}
          >
            {t`Previous`}
          </Button>
          <Button
            variant="outline"
            isDisabled={
              (!picker.hasNextPage && pageIndex === picker.data.pages.length - 1) ||
              picker.isFetchingNextPage
            }
            onPress={async () => {
              if (pageIndex + 1 === picker.data.pages.length) await picker.fetchNextPage();
              setPageIndex((index) => index + 1);
            }}
          >
            {t`Next`}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
