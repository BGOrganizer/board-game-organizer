"use client";

import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Info, UsersRound } from "lucide-react";
import Link from "next/link";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { EventStatusBadge } from "./EventStatusBadge";
import { EventVoteLegend } from "./EventVoteLegend";

export function EventDetailsCard({ event }: { event: PlannedEventResponse }) {
  const { t } = useLingui();
  return (
    <section aria-label={t`Details`} className="space-y-2">
      <div className="flex items-center gap-1">
        <Info className="size-5 text-default-500" aria-hidden />
        <span className="font-bold">{t`Details`}</span>
        <EventVoteLegend />
      </div>
      <ListCard>
        <div className="flex min-w-0 items-start gap-4 p-4">
          <AnimatedDicebearArtwork seed={event.id} variant="waves" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-default-500" aria-hidden />
              <h1 className="min-w-0 flex-1 break-words text-base font-normal">{event.name}</h1>
              <EventStatusBadge status={event.status} />
            </div>
            {event.groupId ? (
              <div className="flex items-center gap-2 text-sm">
                <UsersRound className="size-4 shrink-0 text-default-500" aria-hidden />
                {event.groupName ? (
                  <Link
                    href={`/groups/${event.groupId}`}
                    className="min-w-0 break-words text-accent hover:underline focus-visible:underline"
                  >
                    {event.groupName}
                  </Link>
                ) : (
                  <Skeleton className="h-4 w-32 rounded" />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </ListCard>
    </section>
  );
}
