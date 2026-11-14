"use client";

import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { EventCardIndicators } from "./EventCardIndicators";

export function EventDetailsCard({
  event,
  titleAction,
}: {
  event: PlannedEventResponse;
  titleAction?: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <section aria-label={t`Details`}>
      <RecordIdentityCard
        titleAction={titleAction}
        title={event.name}
        icon={CalendarDays}
        background={
          <AnimatedDicebearArtwork
            seed={event.id}
            variant="constellation"
            presentation="background"
          />
        }
      >
        <EventCardIndicators event={event} />
      </RecordIdentityCard>
    </section>
  );
}
