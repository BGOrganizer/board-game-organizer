"use client";

import type { BggPickerItem, BggSearchItem } from "@board-game-organizer/schemas";
import {
  type BggPickerTableScope,
  bggPickerQuery,
  bggPickerUnavailable,
  useBggAccount,
  useBggPicker,
  useGameListWindow,
} from "@board-game-organizer/shared";
import { Button, ListBox, Skeleton } from "@heroui/react";
import { Collection, ListBoxLoadMoreItem, ListLayout, Virtualizer } from "@heroui/react/rac";
import { useLingui } from "@lingui/react/macro";
import { hashKey } from "@tanstack/react-query";
import { ArrowLeft, Gamepad2, LibraryBig, Plus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListCard } from "@/components/games/GameListCard";

const layoutOptions = { estimatedRowHeight: 76, gap: 8 };

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
  const { items, hasMore, beginScroll, endReached } = useGameListWindow({
    scope,
    pages: denied ? undefined : picker.data?.pages,
    excludedIds: excludeSet,
    ...picker,
  });
  const beginUserScroll = (node: HTMLElement) => {
    beginScroll();
    if (node.scrollHeight - node.scrollTop - node.clientHeight < 200) endReached();
  };
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const select = (item: BggPickerItem) => {
    if (scopeRef.current !== scope || denied || selected.current || excludeSet.has(item.id)) return;
    selected.current = true;
    // Preserve supplied catalog metadata; scheduling applies its own duration convention.
    onSelect(item);
  };

  const active = (search && debounced.length >= 4) || (collection && hasCollection) || participants;
  return (
    <div
      data-input-scope
      className="mx-auto w-full max-w-5xl pb-8"
      onKeyDownCapture={(event) => {
        const list =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[role="listbox"]')
            : null;
        if (list && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "End"].includes(event.key))
          beginUserScroll(list);
      }}
    >
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
            if (account.account.isError) void account.account.refetch();
            if (picker.isError)
              void (picker.isFetchNextPageError
                ? picker.fetchNextPage({ cancelRefetch: false })
                : picker.refetch());
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
      {!picker.isPending && !picker.isError && !hasMore && items.length === 0 && active ? (
        <EmptyList icon={<Gamepad2 className="size-7" />}>{t`No games found`}</EmptyList>
      ) : null}
      {active && (items.length || hasMore) ? (
        <Virtualizer layout={ListLayout} layoutOptions={layoutOptions} shouldObserveItemSize>
          <ListBox
            key={scope}
            aria-label={t`Board games`}
            selectionMode="none"
            data-input-results
            className="mt-3 h-[var(--input-results-height,60dvh)] min-h-24 w-full overflow-auto"
            onWheel={(event) => beginUserScroll(event.currentTarget)}
            onTouchMove={(event) => beginUserScroll(event.currentTarget)}
            onScroll={(event) => {
              const node = event.currentTarget;
              if (node.scrollHeight - node.scrollTop - node.clientHeight < 200) endReached();
            }}
          >
            <Collection items={items}>
              {(item) => (
                <ListBox.Item
                  id={item.id}
                  textValue={item.name}
                  aria-label={`${t`Select`}: ${item.name}`}
                  className="p-0"
                  onAction={() => select(item)}
                >
                  <GameListCard
                    name={item.name}
                    imageUrl={item.imageUrl}
                    year={item.year}
                    average={item.average}
                    rank={item.rank}
                    actions={
                      <span
                        aria-hidden
                        className="inline-flex size-11 shrink-0 items-center justify-center text-accent"
                      >
                        <Plus className="size-4" />
                      </span>
                    }
                  />
                </ListBox.Item>
              )}
            </Collection>
            {hasMore && !picker.isError ? (
              <ListBoxLoadMoreItem onLoadMore={endReached} isLoading={picker.isFetchingNextPage}>
                {picker.isFetchingNextPage ? <Skeleton className="h-12 w-full rounded-xl" /> : null}
              </ListBoxLoadMoreItem>
            ) : null}
          </ListBox>
        </Virtualizer>
      ) : null}
    </div>
  );
}
