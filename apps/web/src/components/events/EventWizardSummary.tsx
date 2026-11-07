"use client";
import {
  type EventRecordDraft,
  eventDateWall,
  eventLocalToIso,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";

export function EventWizardSummary({
  draft,
  groupName,
  publicGroup = false,
}: {
  draft: EventRecordDraft;
  groupName?: string | null;
  publicGroup?: boolean;
}) {
  const { t } = useLingui();
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{draft.name}</h1>
      <section className="space-y-2">
        <SearchHelpLabel
          label={t`Group`}
          helpTitle={t`Field help`}
          help={
            groupName
              ? t`This event belongs to this group. The group cannot be changed.`
              : t`Choose one of your groups, or create a standalone event without a group.`
          }
        />
        <p>{groupName ?? t`No group`}</p>
      </section>
      <section className="space-y-2">
        <SearchHelpLabel
          label={publicGroup ? t`Start Date and Time` : t`Date and time`}
          helpTitle={t`Field help`}
          help={t`Times are local to the location chosen for the event.`}
        />
        <GroupedList>
          {draft.dates.map((date) => (
            <GroupedRow key={date.id}>
              <DateTimeInfo
                startsAt={eventLocalToIso(eventDateWall(draft, date), draft.timeZone)}
                timeZone={draft.timeZone}
              />
            </GroupedRow>
          ))}
        </GroupedList>
      </section>
      {publicGroup ? (
        <>
          <section className="space-y-2">
            <h2 className="font-semibold">{t`End Date and Time`}</h2>
            <GroupedList>
              <GroupedRow>
                <DateTimeInfo
                  startsAt={eventLocalToIso(draft.endsWall, draft.timeZone)}
                  timeZone={draft.timeZone}
                  timeLabel={t`End time`}
                />
              </GroupedRow>
            </GroupedList>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">{t`Registration Deadline Date and Time`}</h2>
            <GroupedList>
              <GroupedRow>
                <DateTimeInfo
                  startsAt={eventLocalToIso(draft.cutoffWall, draft.timeZone)}
                  timeZone={draft.timeZone}
                  timeLabel={t`Registration Deadline Date and Time`}
                />
              </GroupedRow>
            </GroupedList>
          </section>
        </>
      ) : null}
      <section className="space-y-2">
        <SearchHelpLabel
          label={t`Location`}
          helpTitle={t`Field help`}
          help={t`Verified addresses proposed for this event.`}
        />
        <GroupedList>
          {draft.locations.map((location) => (
            <LocationListRow key={location.id} name={location.name} address={location.address} />
          ))}
        </GroupedList>
      </section>
    </div>
  );
}
