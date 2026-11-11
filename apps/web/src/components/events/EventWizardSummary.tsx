"use client";
import {
  type EventRecordDraft,
  eventDateWall,
  eventSummaryWallTime,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
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
  const { t, i18n } = useLingui();
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
        <h2 className="font-semibold">{t`Settings`}</h2>
        <p>{draft.planningMode === "MANUAL" ? t`Manual` : t`Assisted`}</p>
        <p>{draft.playerPreference === "BEST" ? t`BGG Best` : t`Players`}</p>
        {draft.playerPreference === "BEST" ? (
          <p>{t`BGG Best allows reducing the seated group in Assisted planning.`}</p>
        ) : null}
      </section>
      <section className="space-y-2">
        <SearchHelpLabel
          label={publicGroup ? t`Date and start/end time` : t`Dates and times`}
          helpTitle={t`Field help`}
          help={t`Times are local to the location chosen for the event.`}
        />
        <GroupedList>
          {draft.dates.map((date) => (
            <GroupedRow key={date.id}>
              <p className="min-w-0 flex-1 text-sm text-foreground">
                {eventSummaryWallTime(
                  eventDateWall(draft, date),
                  i18n.locale,
                  publicGroup ? draft.endsWall : undefined,
                )}
              </p>
            </GroupedRow>
          ))}
        </GroupedList>
      </section>
      {publicGroup ? (
        <section className="space-y-2">
          <h2 className="font-semibold">{t`Registration Deadline Date and Time`}</h2>
          <GroupedList>
            <GroupedRow>
              <p className="min-w-0 flex-1 text-sm text-foreground">
                {eventSummaryWallTime(draft.cutoffWall, i18n.locale)}
              </p>
            </GroupedRow>
          </GroupedList>
        </section>
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
