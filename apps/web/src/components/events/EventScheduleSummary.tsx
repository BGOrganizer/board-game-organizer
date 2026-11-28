"use client";

import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventRecordSchedulePreview, formatLocationAddress } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";

export function EventScheduleSummary({ event }: { event: PlannedEventResponse }) {
  const { t } = useLingui();
  const schedule = eventRecordSchedulePreview(event);
  const date = schedule.dates?.[0];
  const location = schedule.locations?.[0];
  return (
    <>
      <div>
        <p className="font-bold">{t`Date and time:`}</p>
        {date ? (
          <DateTimeInfo startsAt={`${date.localStartsAt}Z`} timeZone="UTC" dateStyle="long" />
        ) : (
          <p>{t`No date selected`}</p>
        )}
      </div>
      <div>
        <p className="font-bold">{t`Location:`}</p>
        <p>{location ? formatLocationAddress(location.address) : t`No location selected`}</p>
      </div>
    </>
  );
}
