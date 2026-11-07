"use client";

import type { BggPickerItem, BggSearchItem } from "@board-game-organizer/schemas";
import {
  type BggPickerTableScope,
  bggPickerQuery,
  bggPickerUnavailable,
  useBggAccount,
  useBggPicker,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { hashKey } from "@tanstack/react-query";
import { ArrowLeft, Gamepad2, LibraryBig, Plus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListCard } from "@/components/games/GameListCard";

interface Props {
  apiUrl: string;
  token: string | null;
  getToken?: () => Promise<string | null>;
  userId?: string | null;
  protectionBypass?: string | null;
  excludeIds?: number[];
  proposalScope?: { eventId: string; tableId: string };
  tableScope?: BggPickerTableScope;
  onSelect: (game: BggSearchItem) => void;
  onClose: () => void;
}

export function SearchGamePage({
  apiUrl,
  token,
  getToken,
  userId,
  protectionBypass,
  excludeIds = [],
  proposalScope,
  tableScope,
  onSelect,
  onClose,
}: Props) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [collection, setCollection] = useState(true);
  const [participantSource, setParticipants] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const selected = useRef(false);
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const freshToken = useCallback(
    async () => (getToken ? await getToken() : token),
    [getToken, token],
  );
  const account = useBggAccount({ apiUrl, getToken: freshToken, userId, protectionBypass });
  const hasCollection = Boolean(account.account.data?.active);
  const participants = participantSource && Boolean(tableScope);
  const search = !(collection && hasCollection) && !participants;
  const pickerOptions = {
    apiUrl,
    getToken: freshToken,
    userId,
    query: debounced,
    search,
    collection: collection && hasCollection,
    snapshot: account.account.data?.active?.snapshot,
    protectionBypass,
    proposalScope,
    participants,
    tableScope,
  };
  const picker = useBggPicker(pickerOptions);
  const denied = bggPickerUnavailable(picker.error);
  const scope = hashKey([
    ...bggPickerQuery(pickerOptions).queryKey,
    picker.data?.pages[0]?.sourceEpoch,
    denied,
  ]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const requesting = useRef<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: presentation resets for a changed source epoch.
  useEffect(() => setPageIndex(0), [scope]);

  const select = (item: BggPickerItem) => {
    if (scopeRef.current !== scope || denied || selected.current || excludeSet.has(item.id)) return;
    selected.current = true;
    // Use supplied catalog metadata; missing durations keep the existing manual fallback.
    onSelect(item);
  };

  const page = denied ? undefined : picker.data?.pages[pageIndex];
  const items = (page?.items ?? []).filter((item) => !excludeSet.has(item.id));
  return (
    <div className="mx-auto w-full max-w-5xl pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">{t`Select a board game`}</h2>
      </div>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={t`Search board games`}
        label={
          <SearchHelpLabel
            label={t`Search board games`}
            help={t`Choose collections to filter, or turn all collection filters off to search the catalog (at least 4 characters).`}
          />
        }
      />
      <div className="mt-3">
        <FilterChips
          options={[
            ...(hasCollection
              ? [{ key: "collection" as const, label: t`Collection`, icon: LibraryBig }]
              : []),
            ...(tableScope
              ? [
                  {
                    key: "participants" as const,
                    label: t`Participants' collections`,
                    icon: UsersRound,
                  },
                ]
              : []),
          ]}
          selected={[
            ...(collection && hasCollection ? ["collection" as const] : []),
            ...(participants ? ["participants" as const] : []),
          ]}
          onToggle={(key) => {
            if (key === "participants") setParticipants((value) => !value);
            else setCollection((value) => !value);
          }}
        />
      </div>
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
      {picker.isPending &&
      ((search && debounced.length >= 4) || (collection && hasCollection) || participants) ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : null}
      {!picker.isPending &&
      !picker.isError &&
      items.length === 0 &&
      (debounced.length >= 4 || (collection && hasCollection) || participants) ? (
        <EmptyList icon={<Gamepad2 className="size-7" />}>{t`No games found`}</EmptyList>
      ) : null}
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <GameListCard
            key={item.id}
            name={item.name}
            imageUrl={item.imageUrl}
            year={item.year}
            average={item.average}
            rank={item.rank}
            actions={
              <Button
                isIconOnly
                className="shrink-0"
                size="sm"
                variant="primary"
                aria-label={`${t`Select`}: ${item.name}`}
                onPress={() => void select(item)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            }
          />
        ))}
      </div>
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
              if (requesting.current === scope || picker.isFetchingNextPage) return;
              requesting.current = scope;
              try {
                if (pageIndex + 1 === picker.data.pages.length) {
                  const result = await picker.fetchNextPage();
                  if (result?.isError) return;
                }
                if (scopeRef.current === scope) setPageIndex(pageIndex + 1);
              } finally {
                if (requesting.current === scope) requesting.current = null;
              }
            }}
          >
            {t`Next`}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
