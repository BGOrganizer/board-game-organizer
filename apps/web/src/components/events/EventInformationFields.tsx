"use client";

import {
  eventGroupChangeNeedsConfirmation,
  type useEventRecordForm,
} from "@board-game-organizer/shared";
import { Button, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { NameInput } from "@/components/common/ui/NameInput";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { EventGroupSelect } from "./EventGroupSelect";
import { EventVisibilityPicker } from "./EventVisibilityPicker";

export function EventInformationFields({
  form,
  busy,
}: {
  form: ReturnType<typeof useEventRecordForm>;
  busy: boolean;
}) {
  const { t } = useLingui();
  const [pending, setPending] = useState<{ id: string; type: "PUBLIC" } | null>(null);
  const { draft, fieldError } = form;
  const choose = (id: string | null, type: "PRIVATE" | "PUBLIC" | null) => {
    if (form.groupLocked || id === draft.groupId) return;
    if (id && type === "PUBLIC" && eventGroupChangeNeedsConfirmation(draft, true))
      setPending({ id, type });
    else form.selectGroup(id, type);
  };
  return (
    <div className="space-y-5">
      <EventVisibilityPicker
        value={draft.visibility ?? "PRIVATE"}
        publicAllowed={form.publicGroup}
        locked={form.visibilityLocked}
        busy={busy}
        onChange={(visibility) => form.patch({ visibility })}
      />
      <div className="grid grid-cols-2 items-start gap-4">
        <TextField
          value={draft.name}
          onChange={(name) => form.patch({ name })}
          isRequired
          isDisabled={busy}
          isInvalid={fieldError("name")}
          className="min-w-0"
        >
          <SearchHelpLabel
            required
            label={t`Event name`}
            helpTitle={t`Field help`}
            help={t`Choose a recognizable event name between 5 and 120 characters.`}
          />
          <NameInput
            category="evento"
            isDisabled={busy}
            onGenerate={(name) => form.patch({ name })}
            placeholder={t`Friday game night`}
          />
          {fieldError("name") ? (
            <p
              role="alert"
              className="text-sm text-danger"
            >{t`Enter an event name between 5 and 120 characters.`}</p>
          ) : null}
        </TextField>
        <section
          data-form-field
          data-form-error={fieldError("groupId") || undefined}
          className="min-w-0 space-y-2"
        >
          <SearchHelpLabel
            label={t`Group`}
            helpTitle={t`Field help`}
            help={
              form.groupLocked
                ? t`This event belongs to this group. The group cannot be changed.`
                : t`Choose one of your groups, or create a standalone event without a group.`
            }
          />
          {draft.groupId && form.groupQuery.isPending ? (
            <Skeleton className="h-12 w-full rounded-xl" />
          ) : (
            <EventGroupSelect
              groupId={draft.groupId}
              group={form.group}
              locked={form.groupLocked}
              busy={busy}
              onChange={choose}
            />
          )}
          {draft.groupId && form.groupQuery.isError ? (
            <div role="alert">
              <p className="text-danger">{t`Could not load group`}</p>
              <Button
                variant="outline"
                data-form-control
                onPress={() => void form.groupQuery.refetch()}
              >{t`Try again`}</Button>
            </div>
          ) : fieldError("groupId") ? (
            <p
              role="alert"
              className="text-sm text-danger"
            >{t`An approved group and its administrator are required.`}</p>
          ) : null}
        </section>
      </div>
      {pending ? (
        <ContactConfirmDialog
          title={t`Change group`}
          description={t`Public groups allow one date and one location and do not allow participant proposals. Keep the first options and disable proposals?`}
          busy={busy}
          onCancel={() => setPending(null)}
          actions={[
            {
              label: t`Change group`,
              variant: "primary",
              icon: <ArrowRightLeft className="size-4" aria-hidden />,
              onPress: () => {
                form.selectGroup(pending.id, pending.type);
                setPending(null);
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}
