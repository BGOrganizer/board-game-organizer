"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import type { CreateEventVariables, EditEventVariables } from "@board-game-organizer/shared";
import {
  communityAccessDenied,
  creationState,
  eventDateWall,
  eventRecordKeys,
  useClientMutationDraft,
  useEventCreationDraft,
  useEventRecord,
  useEventRecordActions,
  useEventRecordForm,
  useFavoriteLocations,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, ArrowRight, CalendarPlus, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { SearchGamePage } from "@/components/games/SearchGamePage";
import { GroupMemberPicker } from "@/components/groups/GroupMemberPicker";
import { SearchLocationPage } from "@/components/locations/SearchLocationPage";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDraftTableCard } from "./EventDraftTableCard";
import { EventDraftTableEditor } from "./EventDraftTableEditor";
import { EventScheduleFields } from "./EventScheduleFields";
import { EventWizardSummary } from "./EventWizardSummary";

export function EventWizard({
  eventId,
  groupId,
  draftId,
}: {
  eventId?: string;
  groupId?: string;
  draftId?: string;
}) {
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
  if (draftId) return <RecoveredEditor draftId={draftId} />;
  return (
    <Editor
      key={`${o.apiUrl}/${o.userId}/${eventId ?? groupId ?? "new"}`}
      event={eventId ? q.data : undefined}
      groupId={groupId}
    />
  );
}
function RecoveredEditor({ draftId }: { draftId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    recovery = useEventCreationDraft(o, draftId);
  if (!recovery?.variables.clientDraft || creationState(recovery).phase !== "failed")
    return <p role="alert" className="text-danger">{t`Could not recover draft`}</p>;
  return (
    <Editor
      key={`${o.apiUrl}/${o.userId}/${draftId}`}
      recovery={recovery.variables}
      groupId={recovery.variables.clientInitialGroupId}
    />
  );
}
function Editor({
  event,
  groupId,
  recovery,
}: {
  event?: PlannedEventResponse;
  groupId?: string;
  recovery?: CreateEventVariables;
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    a = useEventRecordActions(o, event?.id ?? ""),
    edit = useClientMutationDraft<EditEventVariables>(
      [...eventRecordKeys.mutation(o, event?.id ?? ""), "update"],
      event?.version,
    ),
    editDraft = event ? edit?.variables?.clientDraft : undefined,
    checking = edit?.phase === "saving" || edit?.phase === "verifying",
    form = useEventRecordForm(
      o,
      event,
      groupId,
      editDraft && event ? { ...editDraft, version: event.version } : recovery?.clientDraft,
    );
  const [newDateTime, setNewDateTime] = useState(""),
    [pick, setPick] = useState<{ kind: "game" | "demonstrator"; key: string } | "location" | null>(
      null,
    ),
    [remove, setRemove] = useState<string | null>(null),
    [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const favorites = useFavoriteLocations(o, form.draft.locations);
  const { draft, step } = form,
    publicGroup = (form.group?.type ?? event?.groupType) === "PUBLIC";
  const save = () => {
    const parsed = form.validate();
    if (!parsed.success || submitted.current || (event && (a.busy || checking)) || form.conflict)
      return;
    submitted.current = true;
    setSubmitting(true);
    if ("version" in parsed.data) a.update.mutate({ ...parsed.data, clientDraft: draft });
    else
      a.create.mutate({
        ...parsed.data,
        clientRequestId: recovery?.clientRequestId,
        clientDraft: draft,
        clientInitialGroupId: groupId,
        clientGroup: form.group
          ? { id: form.group.id, name: form.group.name, type: form.group.type }
          : undefined,
      });
    const targetGroup = "groupId" in parsed.data ? parsed.data.groupId : event?.groupId;
    router.replace(
      event ? `/events/${event.id}` : targetGroup ? `/groups/${targetGroup}?tab=events` : "/events",
    );
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
            isDisabled={submitting || index > step}
            onPress={() => form.goToStep(index)}
          >
            {index + 1}. {label}
          </Button>
        ))}
      </div>
      {checking ? <p role="status">{t`Checking saved changes`}</p> : null}
      {form.conflict ? (
        <p
          role="alert"
          className="text-danger"
        >{t`This event changed. Go back and reopen the editor before saving.`}</p>
      ) : null}
      {step === 0 ? (
        <EventScheduleFields
          form={form}
          busy={submitting}
          dateTime={newDateTime}
          onDateTimeChange={setNewDateTime}
          onLocation={() => setPick("location")}
        />
      ) : step === 1 ? (
        <>
          <Button variant="outline" isDisabled={submitting} onPress={form.addTable}>
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
              busy={submitting}
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
      <div className={`flex gap-3 ${step > 0 ? "justify-between" : "justify-end"}`}>
        {step > 0 ? (
          <Button
            isIconOnly
            variant="ghost"
            aria-label={t`Back`}
            isDisabled={submitting}
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
            isDisabled={submitting || form.closed || form.conflict || !form.canNext}
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
              submitting ||
              Boolean(event && (a.busy || checking)) ||
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
          busy={submitting}
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
