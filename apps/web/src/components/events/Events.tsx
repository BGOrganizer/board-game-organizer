"use client";
import {
  communityAccessDenied,
  formatLocationAddress,
  useEventList,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";

import { useEffect, useState } from "react";

import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

export function Events({ organizationId = "" }: { organizationId?: string }) {
  const { t, i18n } = useLingui();
  const options = useCommunityApi();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const list = useEventList(options, organizationId, search);
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    fetchNextPage: list.fetchNextPage,
  });
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-28">
      <TextField value={query} onChange={setQuery}>
        <Label>{t`Search events`}</Label>
        <div className="flex gap-2">
          <Input name="events-search" autoComplete="off" maxLength={120} />
          <Button variant="ghost" onPress={() => setQuery("")}>{t`Clear`}</Button>
        </div>
      </TextField>
      {list.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {(communityAccessDenied(list.error) ? [] : list.items).map((event) => (
        <LinkedListCard
          key={event.id}
          href={`/events/${event.id}`}
          label={`${t`Open event`}: ${event.name}`}
        >
          <CalendarDays aria-hidden className="size-6 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{event.name}</span>
            <span className="block text-sm">
              {event.organizationName} · {event.status === "DRAFT" ? t`Draft` : t`Published`}
            </span>
            <time dateTime={event.startsAt}>
              {new Intl.DateTimeFormat(i18n.locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: event.timeZone,
              }).format(new Date(event.startsAt))}
            </time>
            <span className="block truncate text-sm">
              {formatLocationAddress(event.location.address)}
            </span>
          </span>
        </LinkedListCard>
      ))}
      {list.isError ? (
        <div role="alert">
          <p>{t`Could not load events`}</p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Retry`}</Button>
        </div>
      ) : null}
      {!list.isPending && !list.isError && !list.items.length ? <p>{t`No events found`}</p> : null}
      <div ref={sentinel} />
      {list.isFetchingNextPage ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
      {list.hasNextPage ? (
        <Button
          isDisabled={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
        >{t`Load more`}</Button>
      ) : null}
      <Link
        href={`/events/new${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""}`}
        className="fixed right-6 bottom-6 flex min-h-14 items-center gap-2 rounded-full bg-accent px-5 text-accent-foreground shadow-lg"
      >
        <Plus aria-hidden />
        {t`New event`}
      </Link>
    </section>
  );
}
