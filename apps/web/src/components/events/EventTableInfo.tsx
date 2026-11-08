"use client";

import { notificationItemId, type PlannedTableResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { Dices } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { EventTableCardIndicators } from "./EventTableCardIndicators";

export function EventTableInfo({ table }: { table: PlannedTableResponse }) {
  const { t } = useLingui();
  return (
    <section aria-label={t`Settings`}>
      <RecordIdentityCard
        title={table.name}
        icon={<Dices className="mt-1 size-5 shrink-0 text-foreground" aria-hidden />}
        background={
          <AnimatedDicebearArtwork seed={table.id} variant="planets" presentation="background" />
        }
        titleAccessory={
          <NotificationItem
            itemId={notificationItemId(table.id, "overview", undefined, "table")}
            readOnly
          />
        }
      >
        <EventTableCardIndicators table={table} variant="identity" />
      </RecordIdentityCard>
    </section>
  );
}
