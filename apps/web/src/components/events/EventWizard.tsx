"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  eventDateWall,
  useEventRecord,
  useEventRecordActions,
  useEventRecordForm,
  useFavoriteLocations,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, ArrowRight, CalendarPlus, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { SearchGamePage } from "@/components/games/SearchGamePage";
import { GroupMemberPicker } from "@/components/groups/GroupMemberPicker";
import { SearchLocationPage } from "@/components/locations/SearchLocationPage";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDraftTableCard } from "./EventDraftTableCard";
import { EventDraftTableEditor } from "./EventDraftTableEditor";
import { EventScheduleFields } from "./EventScheduleFields";
import { EventWizardSummary } from "./EventWizardSummary";

export function EventWizard({ eventId, groupId }: { eventId?: string; groupId?: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useEventRecord({ ...o, enabled: o.enabled !== false && !!eventId }, eventId ?? "");
  if (
    eventId &&
    (communityAccessDenied(q.error) || !q.data || q.isPlaceholderData || !q.data.canEdit)
  )
    return q.isPending || q.isPlaceholderData ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not edit event`}</p>
        <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
      </div>
    );
  return (
    <Editor
      key={eventId ?? groupId ?? "new"}
      event={eventId ? q.data : undefined}
      groupId={groupId}
    />
  );
}
function Editor({ event, groupId }: { event?: PlannedEventResponse; groupId?: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    form = useEventRecordForm(o, event, groupId),
    a = useEventRecordActions(o, event?.id ?? "");
  const [newDateTime, setNewDateTime] = useState(""),
    [pick, setPick] = useState<{ kind: "game" | "demonstrator"; key: string } | "location" | null>(
      null,
    ),
    [remove, setRemove] = useState<string | null>(null),
    [serverError, setServerError] = useState(false);
  const favorites = useFavoriteLocations(o, form.draft.locations);
  const { draft, step } = form,
    publicGroup = (form.group?.type ?? event?.groupType) === "PUBLIC";
  const save = async () => {
    const parsed = form.validate();
    if (!parsed.success || a.busy || form.conflict) return;
    setServerError(false);
    try {
      const result =
        "version" in parsed.data
          ? await a.update.mutateAsync(parsed.data)
          : await a.create.mutateAsync(parsed.data);
      router.replace(
        event
          ? `/events/${result.id}`
          : result.groupId
            ? `/groups/${result.groupId}?tab=events`
            : "/events",
      );
    } catch {
      setServerError(true);
    }
  };
  if (pick === "location")
    return (
      <SearchLocationPage
        apiUrl={o.apiUrl}
        getToken={o.getToken}
        userId={o.userId}
        protectionBypass={o.protectionBypass ?? undefined}
        favorites={favorites}
        onSelect={(value) => {
          form.addLocation(value);
          setPick(null);
        }}
        onClose={() => setPick(null)}
      />
    );
  if (pick && typeof pick === "object" && pick.kind === "game")
    return (
      <SearchGamePage
        apiUrl={o.apiUrl}
        token={null}
        getToken={o.getToken}
        userId={o.userId}
        protectionBypass={o.protectionBypass ?? undefined}
        excludeIds={draft.tables.find((row) => row.key === pick.key)?.games.map((game) => game.id)}
        onSelect={(game) => {
          form.addGame(pick.key, game);
          setPick(null);
        }}
        onClose={() => setPick(null)}
      />
    );
  if (pick && typeof pick === "object" && pick.kind === "demonstrator" && draft.groupId)
    return (
      <div className="space-y-4">
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={() => setPick(null)}>
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <GroupMemberPicker
          groupId={draft.groupId}
          onSelect={(person) => {
            form.patchTable(pick.key, {
              demonstratorUserId: person.id,
              demonstratorName: person.name,
              demonstratorAvatarUrl: person.avatarUrl,
            });
            setPick(null);
          }}
        />
      </div>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-5 pt-8 pb-28">
      <div className="flex flex-wrap justify-center gap-2 py-2">
        {[t`Event`, t`Tables`, t`Review`].map((label, index) => (
          <Button
            key={label}
            variant={step === index ? "primary" : "ghost"}
            aria-current={step === index ? "step" : undefined}
            isDisabled={a.busy || index > step}
            onPress={() => form.goToStep(index)}
          >
            {index + 1}. {label}
          </Button>
        ))}
      </div>
      {form.conflict ? (
        <p
          role="alert"
          className="text-danger"
        >{t`This event changed. Go back and reopen the editor before saving.`}</p>
      ) : null}
      {step === 0 ? (
        <EventScheduleFields
          form={form}
          busy={a.busy}
          dateTime={newDateTime}
          onDateTimeChange={setNewDateTime}
          onLocation={() => setPick("location")}
        />
      ) : step === 1 ? (
        <>
          <Button variant="outline" isDisabled={a.busy} onPress={form.addTable}>
            <Plus className="size-4" aria-hidden />
            {t`Add table`}
          </Button>
          {draft.tables.map((row, index) => (
            <EventDraftTableEditor
              key={row.key}
              row={row}
              publicGroup={publicGroup}
              eventStartWall={draft.dates[0] ? eventDateWall(draft, draft.dates[0]) : ""}
              eventEndWall={draft.endsWall}
              busy={a.busy}
              fieldError={(path) => form.fieldError(`tables.${index}.${path}`)}
              onChange={(value) => form.patchTable(row.key, value)}
              onRemove={() => setRemove(row.key)}
              onGame={() => setPick({ kind: "game", key: row.key })}
              onDemonstrator={() => setPick({ kind: "demonstrator", key: row.key })}
            />
          ))}
          {form.fieldError("tables") && !draft.tables.length ? (
            <p role="alert" className="text-danger">{t`Add at least one table.`}</p>
          ) : null}
        </>
      ) : (
        <>
          <EventWizardSummary
            draft={draft}
            groupName={form.group?.name ?? event?.groupName}
            publicGroup={publicGroup}
          />
          <div className="space-y-3">
            {draft.tables.map((row) => (
              <EventDraftTableCard key={row.key} row={row} publicGroup={publicGroup} />
            ))}
          </div>
          <p>{t`Nothing is saved until final confirmation. The organizer has no automatic playing seat.`}</p>
        </>
      )}
      {step > 0 && event && form.tables.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : null}
      {step > 0 && form.tables.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load tables`}</p>
          <Button onPress={() => void form.tables.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {step > 0 && form.tables.hasNextPage ? (
        <Button
          isDisabled={form.tables.isFetchingNextPage}
          onPress={() => void form.tables.fetchNextPage()}
        >{t`Load more tables`}</Button>
      ) : null}
      {form.closed ? <p role="alert" className="text-danger">{t`Bookings are closed`}</p> : null}
      {form.error ? (
        <p
          role="alert"
          className="text-danger"
        >{t`Check required fields, dates, player limits, games and durations.`}</p>
      ) : null}
      {serverError ? (
        <p
          role="alert"
          className="text-danger"
        >{t`Could not save event. Check timing, conflicts and permissions, then try again.`}</p>
      ) : null}
      <div className={`flex gap-3 ${step > 0 ? "justify-between" : "justify-end"}`}>
        {step > 0 ? (
          <Button
            isIconOnly
            variant="ghost"
            aria-label={t`Back`}
            isDisabled={a.busy}
            onPress={() => form.goToStep(step - 1)}
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
        ) : null}
        {step < 2 ? (
          <Button
            isIconOnly
            variant="primary"
            aria-label={t`Next`}
            isDisabled={a.busy || form.closed || form.conflict || !form.canNext}
            onPress={form.next}
          >
            <ArrowRight className="size-5" aria-hidden />
          </Button>
        ) : (
          <Button
            isIconOnly
            variant="primary"
            aria-label={event ? t`Save event` : t`Create event`}
            isDisabled={
              a.busy ||
              form.conflict ||
              form.closed ||
              (!!draft.groupId && (!form.group?.canInvite || form.group.role !== "admin"))
            }
            onPress={() => void save()}
          >
            {event ? (
              <Save className="size-5" aria-hidden />
            ) : (
              <CalendarPlus className="size-5" aria-hidden />
            )}
          </Button>
        )}
      </div>
      {remove ? (
        <ContactConfirmDialog
          title={t`Remove table`}
          description={t`This table and its active registrations will be removed only when you save the event.`}
          busy={a.busy}
          onCancel={() => setRemove(null)}
          actions={[
            {
              label: t`Remove table`,
              variant: "danger",
              icon: <Trash2 className="size-4" aria-hidden />,
              onPress: () => {
                form.removeTable(remove);
                setRemove(null);
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}
