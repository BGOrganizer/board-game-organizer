"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useTableGuestVoteForm } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventVoteButtons } from "./EventVoteButtons";

export function EventGuestVoteEditor({
  table,
  registrationId,
  name,
  onClose,
}: {
  table: PlannedTableResponse;
  registrationId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const form = useTableGuestVoteForm(useCommunityApi(), table, registrationId);
  return (
    <ContactConfirmDialog
      title={t`Edit guest votes`}
      description={name}
      busy={form.saving}
      actions={[]}
      onCancel={onClose}
    >
      {form.loading ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
      {form.error ? (
        <div role="alert" className="space-y-2">
          <p className="text-danger">{t`Could not load guest votes`}</p>
          {!form.unavailable ? (
            <Button variant="secondary" onPress={form.refresh}>{t`Try again`}</Button>
          ) : null}
        </div>
      ) : null}
      {form.failed && !form.error ? (
        <p role="alert" className="mb-3 text-danger">{t`Could not save guest vote. Try again.`}</p>
      ) : null}
      <div className="space-y-4">
        {form.sections.map(({ kind, rows }) => (
          <section className="space-y-2" key={kind}>
            <h3 className="font-semibold">
              {kind === "date" ? t`Dates` : kind === "location" ? t`Locations` : t`Games`}
            </h3>
            <GroupedList>
              {rows.map((row) => {
                const label = row.label || t`Unknown game`;
                return (
                  <GroupedRow className="flex-wrap" key={row.key}>
                    <span className="min-w-0 flex-1 break-words">{label}</span>
                    <EventVoteButtons
                      inline
                      label={label}
                      value={row.value}
                      disabledVotes={row.allowNo ? [] : ["NO"]}
                      busy={form.saving}
                      onChange={(vote) => form.save(row, vote)}
                    />
                  </GroupedRow>
                );
              })}
            </GroupedList>
          </section>
        ))}
      </div>
    </ContactConfirmDialog>
  );
}
