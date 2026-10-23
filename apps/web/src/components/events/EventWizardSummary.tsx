"use client";
import { type EventRecordDraft, eventLocalToIso } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";

export function EventWizardSummary({
  draft,
  groupName,
}: {
  draft: EventRecordDraft;
  groupName?: string | null;
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
          label={t`Event day`}
          helpTitle={t`Field help`}
          help={t`Each event has one calendar day. Remove the selected day before choosing another.`}
        />
        <GroupedList>
          {draft.dates.map((date) => (
            <GroupedRow key={date.id}>
              <DateTimeInfo
                startsAt={eventLocalToIso(`${date.day}T${draft.startTime}`, draft.timeZone)}
                timeZone={draft.timeZone}
              />
            </GroupedRow>
          ))}
        </GroupedList>
      </section>
      <section className="space-y-2">
        <SearchHelpLabel
          label={t`Location`}
          helpTitle={t`Field help`}
          help={t`Each event has one verified address. Its time zone is automatic. Remove the location before choosing another.`}
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
