"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventTableSchedule } from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { ListCard } from "@/components/common/ui/ListCard";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";

export function EventTableScheduleCard({
  table,
  timeZone,
}: {
  table: PlannedTableResponse;
  timeZone?: string;
}) {
  const { t } = useLingui();
  const schedule = eventTableSchedule(table);
  if (!schedule) return null;
  return (
    <section aria-label={t`Table schedule`}>
      <ListCard>
        <div className="space-y-3 p-4 text-sm text-foreground">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span>{t`Date`}:</span>
            {timeZone ? (
              <DateTimeInfo
                startsAt={schedule.startsAt}
                endsAt={schedule.endsAt}
                timeZone={timeZone}
                dateStyle="long"
              />
            ) : (
              <div className="min-w-0 flex-1" role="status" aria-label={t`Loading…`}>
                <Skeleton className="h-4 w-52 max-w-full rounded" />
              </div>
            )}
          </div>
          {schedule.demonstrator ? (
            <GroupedList>
              <GroupedRow>
                <UserIdentity
                  name={schedule.demonstrator.name ?? t`Unknown`}
                  avatarUrl={schedule.demonstrator.avatarUrl}
                  badge={<UserRoleBadge roles={["demonstrator"]} />}
                  secondary={t`Demonstrator`}
                />
              </GroupedRow>
            </GroupedList>
          ) : null}
        </div>
      </ListCard>
    </section>
  );
}
