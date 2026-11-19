"use client";
import {
  type EventRecordDraft,
  eventDateWall,
  eventSummaryWallTime,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Hand, Sparkles, TriangleAlert, Trophy, Users } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
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
  const PlanningIcon = draft.planningMode === "MANUAL" ? Hand : Sparkles;
  const PreferenceIcon = draft.playerPreference === "BEST" ? Trophy : Users;
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{draft.name}</h1>
      <section className="space-y-2">
        <h2 className="font-semibold">{t`Group`}</h2>
        <p>{groupName ?? t`No group`}</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t`Settings`}</h2>
        <p className="flex items-center gap-2">
          <PlanningIcon className="size-5 shrink-0 text-muted" aria-hidden />
          {draft.planningMode === "MANUAL" ? t`Manual` : t`Assisted`}
        </p>
        <p className="flex items-center gap-2">
          <PreferenceIcon className="size-5 shrink-0 text-muted" aria-hidden />
          {draft.playerPreference === "BEST" ? t`BGG Best` : t`Players`}
        </p>
        {draft.playerPreference === "BEST" ? (
          <p className="flex items-start gap-2">
            <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden />
            {t`BGG Best allows reducing the seated group in Assisted planning.`}
          </p>
        ) : null}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">
          {publicGroup ? t`Date and start/end time` : t`Dates and times`}
        </h2>
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
        <h2 className="font-semibold">{t`Locations`}</h2>
        <GroupedList>
          {draft.locations.map((location) => (
            <LocationListRow key={location.id} name={location.name} address={location.address} />
          ))}
        </GroupedList>
      </section>
      <h2 className="font-semibold">{t`Table list`}</h2>
    </div>
  );
}
