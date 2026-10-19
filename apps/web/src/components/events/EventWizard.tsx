"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useEventRecord,
  useEventRecordActions,
  useEventRecordForm,
  useFavoriteLocations,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { SearchGamePage } from "@/components/games/SearchGamePage";
import { GroupMemberPicker } from "@/components/groups/GroupMemberPicker";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { SearchLocationPage } from "@/components/locations/SearchLocationPage";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDraftTableEditor } from "./EventDraftTableEditor";
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
  return <Editor key={eventId ?? "new"} event={eventId ? q.data : undefined} groupId={groupId} />;
}
function Editor({ event, groupId }: { event?: PlannedEventResponse; groupId?: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    form = useEventRecordForm(o, event, groupId),
    a = useEventRecordActions(o, event?.id ?? ""),
    [step, setStep] = useState(0),
    [newDay, setNewDay] = useState(""),
    [pick, setPick] = useState<
      { kind: "game" | "demonstrator"; key: string } | "location" | "group" | null
    >(null),
    [remove, setRemove] = useState<string | null>(null),
    [serverError, setServerError] = useState(false),
    f = useListSearch<never>([]),
    owned = useGroupRecords(
      { ...o, enabled: o.enabled !== false && pick === "group" },
      "mine",
      f.search,
      ["admin"],
    ),
    favorites = useFavoriteLocations(o, form.draft.locations),
    publicGroup = form.group?.type === "PUBLIC",
    draft = form.draft;
  const save = async () => {
    const parsed = form.validate();
    if (!parsed.success || a.busy || form.conflict) return;
    setServerError(false);
    try {
      const result =
        "version" in parsed.data
          ? await a.update.mutateAsync(parsed.data)
          : await a.create.mutateAsync(parsed.data);
      router.replace(`/events/${result.id}`);
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
        <Button onPress={() => setPick(null)}>{t`Back`}</Button>
        <GroupMemberPicker
          groupId={draft.groupId}
          onSelect={(person) => {
            form.patchTable(pick.key, {
              demonstratorUserId: person.id,
              demonstratorName: person.name,
            });
            setPick(null);
          }}
        />
      </div>
    );
  if (pick === "group")
    return (
      <div className="space-y-3">
        <Button onPress={() => setPick(null)}>{t`Back`}</Button>
        <Button
          variant="outline"
          onPress={() => {
            form.patch({ groupId: null, locations: [] });
            setPick(null);
          }}
        >{t`No group`}</Button>
        {owned.items
          .filter((row) => row.canInvite)
          .map((row) => (
            <Button
              key={row.id}
              variant="outline"
              onPress={() => {
                form.patch({ groupId: row.id, locations: [] });
                setPick(null);
              }}
            >
              {row.name}
            </Button>
          ))}
        {owned.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
        {owned.isError ? (
          <p role="alert" className="text-danger">{t`Could not load groups`}</p>
        ) : null}
        {owned.hasNextPage ? (
          <Button onPress={() => void owned.fetchNextPage()}>{t`Load more`}</Button>
        ) : null}
      </div>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      <div className="flex flex-wrap gap-2">
        {[t`Event`, t`Tables`, t`Review`].map((label, index) => (
          <Button
            key={label}
            variant={step === index ? "primary" : "ghost"}
            isDisabled={a.busy}
            onPress={() => setStep(index)}
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
        <>
          <TextField
            value={draft.name}
            onChange={(name) => form.patch({ name })}
            isRequired
            isDisabled={a.busy}
          >
            <Label>{t`Event name`}</Label>
            <Input />
          </TextField>
          {!event ? (
            <Button variant="outline" onPress={() => setPick("group")}>
              {form.group?.name ?? t`No group`}
            </Button>
          ) : (
            <p>{form.group?.name ?? t`No group`}</p>
          )}
          {draft.groupId && form.groupQuery.isPending ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : null}
          {draft.groupId &&
          (form.groupQuery.isError || form.group?.role !== "admin" || !form.group?.canInvite) ? (
            <p
              role="alert"
              className="text-danger"
            >{t`An approved group and its administrator are required.`}</p>
          ) : null}
          <TextField
            value={draft.timeZone}
            onChange={(timeZone) => form.patch({ timeZone })}
            isRequired
            isDisabled={a.busy}
          >
            <Label>{t`Time zone`}</Label>
            <Input />
          </TextField>
          <TextField
            value={draft.startTime}
            onChange={(startTime) => form.patch({ startTime })}
            isRequired
            isDisabled={a.busy}
          >
            <Label>{t`Common start time`}</Label>
            <Input type="time" />
          </TextField>
          {publicGroup ? (
            <>
              <p>{t`Public events have a fixed day and venue. Cutoff and duration constraints apply to players and demonstrators.`}</p>
              <TextField
                value={draft.endsWall}
                onChange={(endsWall) => form.patch({ endsWall })}
                isRequired
              >
                <Label>{t`Event end`}</Label>
                <Input type="datetime-local" />
              </TextField>
              <TextField
                value={draft.cutoffWall}
                onChange={(cutoffWall) => form.patch({ cutoffWall })}
                isRequired
              >
                <Label>{t`Booking cutoff`}</Label>
                <Input type="datetime-local" />
              </TextField>
            </>
          ) : null}
          <TextField value={newDay} onChange={setNewDay}>
            <Label>{t`Event day`}</Label>
            <Input type="date" />
          </TextField>
          <Button
            variant="outline"
            isDisabled={!newDay || (publicGroup && draft.dates.length === 1)}
            onPress={() => {
              form.addDate(newDay);
              setNewDay("");
            }}
          >
            <Plus className="size-4" />
            {t`Add date`}
          </Button>
          {draft.dates.map((row) => (
            <div key={row.id} className="flex items-center justify-between">
              <span>{row.day}</span>
              <Button
                isIconOnly
                variant="danger-soft"
                aria-label={`${t`Remove date`}: ${row.day}`}
                onPress={() => form.patch({ dates: draft.dates.filter((d) => d.id !== row.id) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {draft.locations.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3">
              <LocationListRow name={row.name} address={row.address} />
              {!publicGroup ? (
                <Button
                  isIconOnly
                  variant="danger-soft"
                  aria-label={`${t`Remove location`}: ${row.name}`}
                  onPress={() =>
                    form.patch({ locations: draft.locations.filter((l) => l.id !== row.id) })
                  }
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {!publicGroup ? (
            <Button variant="outline" onPress={() => setPick("location")}>
              <Plus className="size-4" />
              {t`Add location`}
            </Button>
          ) : null}
        </>
      ) : step === 1 ? (
        <>
          <Button variant="outline" isDisabled={a.busy} onPress={form.addTable}>
            <Plus className="size-4" />
            {t`Add table`}
          </Button>
          {draft.tables.map((row) => (
            <EventDraftTableEditor
              key={row.key}
              row={row}
              publicGroup={publicGroup}
              busy={a.busy}
              onChange={(value) => form.patchTable(row.key, value)}
              onRemove={() => setRemove(row.key)}
              onGame={() => setPick({ kind: "game", key: row.key })}
              onDemonstrator={() => setPick({ kind: "demonstrator", key: row.key })}
            />
          ))}
          {form.tables.isPending && event ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
          {form.tables.isError ? (
            <p role="alert" className="text-danger">{t`Could not load tables`}</p>
          ) : null}
          {form.tables.hasNextPage ? (
            <Button
              isDisabled={form.tables.isFetchingNextPage}
              onPress={() => void form.tables.fetchNextPage()}
            >{t`Load more tables`}</Button>
          ) : null}
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">{draft.name}</h1>
          <p>
            {draft.dates.map((row) => row.day).join(", ")} · {draft.startTime} ({draft.timeZone})
          </p>
          {draft.locations.map((row) => (
            <LocationListRow key={row.id} name={row.name} address={row.address} />
          ))}
          {draft.tables.map((row) => (
            <p key={row.key}>
              {row.name}: {row.minPlayers}–{row.maxPlayers} ·{" "}
              {row.games.map((game) => game.name).join(", ")}
            </p>
          ))}
          <p>{t`Nothing is saved until final confirmation. The organizer has no automatic playing seat.`}</p>
          <Button
            isDisabled={
              a.busy ||
              form.conflict ||
              form.closed ||
              (!!draft.groupId && (!form.group?.canInvite || form.group.role !== "admin"))
            }
            onPress={() => void save()}
          >
            {event ? t`Save event` : t`Create event`}
          </Button>
        </>
      )}
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
      <div className="flex justify-between gap-3">
        <Button
          variant="ghost"
          isDisabled={a.busy}
          onPress={() => (step ? setStep(step - 1) : router.back())}
        >{t`Back`}</Button>
        {step < 2 ? (
          <Button isDisabled={a.busy} onPress={() => setStep(step + 1)}>{t`Next`}</Button>
        ) : null}
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
