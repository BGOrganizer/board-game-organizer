"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { Dices } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";

export function EventTableInfoView({
  table,
  indicators,
  titleAction,
  titleAccessory,
}: {
  table: Pick<PlannedTableResponse, "id" | "name">;
  indicators: ReactNode;
  titleAction?: ReactNode;
  titleAccessory?: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <section aria-label={t`Settings`}>
      <RecordIdentityCard
        title={table.name}
        icon={Dices}
        titleAction={titleAction}
        titleAccessory={titleAccessory}
        background={
          <AnimatedDicebearArtwork seed={table.id} variant="tables" presentation="background" />
        }
      >
        {indicators}
      </RecordIdentityCard>
    </section>
  );
}
