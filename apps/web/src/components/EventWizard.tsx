"use client";
import {
  type EventResponse,
  type EventTableInput,
  eventTableInputSchema,
  type MatchLocation,
  type SaveEventInput,
  saveEventSchema,
  updateEventSchema,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  defaultEventBookingClosesAt,
  editableEventTable,
  eventEditResets,
  eventLocalDateTime,
  eventLocalToIso,
  useEvent,
  useEventActions,
  useEventTables,
  useEventWindow,
  useFavoriteLocations,
  useOrganization,
  useOrganizationList,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { SearchGamePage } from "@/components/SearchGamePage";
import { SearchLocationPage } from "@/components/SearchLocationPage";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventWizard({
  eventId,
  organizationId,
}: {
  eventId?: string;
  organizationId?: string;
}) {
  const o = useCommunityApi();
  const { t } = useLingui();
  const detail = useEvent(
    { ...o, enabled: Boolean(eventId) && o.enabled !== false },
    eventId ?? "",
  );
  const organizations = useOrganizationList({
    ...o,
    enabled: !eventId && !organizationId && o.enabled !== false,
  });
  const [chosen, setChosen] = useState(organizationId ?? "");
  const organization = useOrganization(
    { ...o, enabled: !eventId && Boolean(chosen) && o.enabled !== false },
    chosen,
  );
  if (
    !eventId &&
    chosen &&
    (communityAccessDenied(organization.error) || organization.data?.role !== "admin")
  )
    return organization.isPending ? (
      <Skeleton className="h-24 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p>{t`Organization admin required`}</p>
        <Button onPress={() => void organization.refetch()}>{t`Retry`}</Button>
      </div>
    );
  if (
    eventId &&
    (communityAccessDenied(detail.error) ||
      !detail.data ||
      detail.data.role !== "admin" ||
      !detail.data.canModify)
  )
    return detail.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p>{t`Event cannot be edited`}</p>
        <Button onPress={() => void detail.refetch()}>{t`Retry`}</Button>
      </div>
    );
  if (!eventId && !chosen)
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1>{t`Choose an organization`}</h1>
        {organizations.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
        {organizations.items
          .filter((row) => row.role === "admin")
          .map((row) => (
            <Button key={row.id} onPress={() => setChosen(row.id)}>
              {row.name}
            </Button>
          ))}
        {organizations.isError ? (
          <Button onPress={() => void organizations.refetch()}>{t`Retry`}</Button>
        ) : null}
        {organizations.hasNextPage ? (
          <Button onPress={() => void organizations.fetchNextPage()}>{t`Load more`}</Button>
        ) : null}
        {!organizations.isPending &&
        !organizations.isError &&
        !organizations.items.some((row) => row.role === "admin") ? (
          <p>{t`Create an organization before creating an event`}</p>
        ) : null}
      </section>
    );
  return (
    <Editor
      key={`${o.userId}/${eventId ?? chosen}`}
      event={detail.data}
      organizationId={detail.data?.organizationId ?? chosen}
    />
  );
}
type DraftTable = { key: string; input: EventTableInput; gameName: string };
function Editor({ event, organizationId }: { event?: EventResponse; organizationId: string }) {
  const { t } = useLingui();
  const o = useCommunityApi();
  const router = useRouter();
  const actions = useEventActions(o);
  const tables = useEventTables(
    { ...o, enabled: Boolean(event) && o.enabled !== false },
    event?.id ?? "",
  );
  const favorites = useFavoriteLocations(o);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(event?.name ?? "");
  const [zone, setZone] = useState(
    event?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [start, setStart] = useState(
    event ? eventLocalDateTime(event.startsAt, event.timeZone).slice(0, 16) : "",
  );
  const [end, setEnd] = useState(
    event ? eventLocalDateTime(event.endsAt, event.timeZone).slice(0, 16) : "",
  );
  const [cutoff, setCutoff] = useState(
    event ? eventLocalDateTime(event.bookingClosesAt, event.timeZone).slice(0, 16) : "",
  );
  const [location, setLocation] = useState<MatchLocation | undefined>(event?.location);
  const [pickLocation, setPickLocation] = useState(false);
  const [edited, setEdited] = useState<DraftTable[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [table, setTable] = useState<DraftTable | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<SaveEventInput | null>(null);
  const mutable = useEventWindow(event);
  function input(status: "DRAFT" | "PUBLISHED"): SaveEventInput | null {
    try {
      const startsAt = eventLocalToIso(start, zone, event?.startsAt);
      const endsAt = eventLocalToIso(end, zone, event?.endsAt);
      const bookingClosesAt = cutoff
        ? eventLocalToIso(cutoff, zone, event?.bookingClosesAt)
        : defaultEventBookingClosesAt(startsAt);
      const raw = {
        name,
        timeZone: zone,
        startsAt,
        endsAt,
        bookingClosesAt,
        location,
        status,
        tables: edited.map((row) => row.input),
      };
      const parsed = event
        ? updateEventSchema.safeParse({ ...raw, version: event.version, removedTableIds: removed })
        : saveEventSchema.safeParse(raw);
      if (!parsed.success) throw new Error("Invalid event");
      return parsed.data;
    } catch {
      setError(t`Check event name, dates, time zone, verified address and tables`);
      return null;
    }
  }
  async function save(data: SaveEventInput) {
    try {
      const row = event
        ? await actions.update.mutateAsync({
            id: event.id,
            input: { ...data, version: event.version, removedTableIds: removed },
          })
        : await actions.create.mutateAsync({ organizationId, input: data });
      router.replace(`/events/${row.id}`);
    } catch {
      setPending(null);
      setError(
        t`Could not save event. Publication requires an approved organization and configured deadline service.`,
      );
    }
  }
  function submit(status: "DRAFT" | "PUBLISHED") {
    setError("");
    const data = input(status);
    if (!data) return;
    if (event && eventEditResets(event, data, tables.items, removed)) setPending(data);
    else void save(data);
  }
  if (event && !mutable)
    return (
      <section className="flex flex-col gap-3" role="alert">
        <p>{t`Bookings are closed. Results can still be recorded.`}</p>
        <Button onPress={() => router.replace(`/events/${event.id}`)}>{t`Back to event`}</Button>
      </section>
    );
  if (pickLocation)
    return (
      <SearchLocationPage
        {...o}
        protectionBypass={o.protectionBypass ?? undefined}
        favorites={favorites}
        initial={location}
        onSelect={(value) => {
          setLocation(value);
          setPickLocation(false);
        }}
        onClose={() => setPickLocation(false)}
      />
    );
  if (table)
    return (
      <TableEditor
        key={table.key}
        draft={table}
        timeZone={zone}
        organizationId={organizationId}
        onClose={() => setTable(null)}
        onSave={(value) => {
          setEdited((rows) => [...rows.filter((row) => row.key !== value.key), value]);
          setRemoved((ids) => ids.filter((id) => id !== value.input.id));
          setTable(null);
        }}
      />
    );
  const loaded: DraftTable[] = tables.items
    .filter((row) => !removed.includes(row.id) && !edited.some((d) => d.input.id === row.id))
    .map((row) => ({ key: row.id, input: editableEventTable(row), gameName: row.gameName }));
  const rows = [...loaded, ...edited];
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <Button
        variant="ghost"
        onPress={() => (step ? setStep(step - 1) : router.back())}
      >{t`Back`}</Button>
      <h1 className="text-xl font-semibold">{event ? t`Edit event` : t`New event`}</h1>
      <p>{step === 0 ? t`Event information` : step === 1 ? t`Tables` : t`Review event`}</p>
      {step === 0 ? (
        <>
          <TextField value={name} onChange={setName}>
            <Label>{t`Event name`}</Label>
            <Input name="event-name" maxLength={120} />
          </TextField>
          <TextField value={zone} onChange={setZone}>
            <Label>{t`Time zone`}</Label>
            <Input name="time-zone" autoComplete="off" />
          </TextField>
          {[
            [t`Starts at`, start, setStart],
            [t`Ends at`, end, setEnd],
            [t`Booking deadline`, cutoff, setCutoff],
          ].map(([label, value, setter]) => (
            <TextField
              key={String(label)}
              value={String(value)}
              onChange={setter as (value: string) => void}
            >
              <Label>{String(label)}</Label>
              <Input type="datetime-local" />
            </TextField>
          ))}
          <p>{t`Default booking deadline is 24 hours before the event starts`}</p>
          <Button variant="secondary" onPress={() => setPickLocation(true)}>
            {location?.name ?? t`Choose a verified address`}
          </Button>
          {location ? <p>{location.address}</p> : null}
        </>
      ) : (
        <>
          <p>
            {name} · {zone}
          </p>
          <p>
            {start} – {end}
          </p>
          <p>{location?.name}</p>
          {event ? (
            <p>{t`Unloaded tables are retained. Only explicit removals delete tables.`}</p>
          ) : null}
          {tables.isPending && event ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-3 rounded-xl bg-surface p-3"
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 80px" }}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{row.input.name}</span>
                <span>
                  {row.gameName} · {row.input.minPlayers}–{row.input.maxPlayers}
                </span>
              </span>
              <Button
                isIconOnly
                size="sm"
                aria-label={`${t`Edit table`}: ${row.input.name}`}
                onPress={() => setTable(row)}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                isIconOnly
                aria-label={`${t`Remove table`}: ${row.input.name}`}
                variant="danger"
                onPress={() => {
                  if (row.input.id) setRemoved((ids) => [...ids, row.input.id!]);
                  setEdited((list) => list.filter((d) => d.key !== row.key));
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          {tables.isError ? (
            <Button onPress={() => void tables.refetch()}>{t`Could not load tables. Retry`}</Button>
          ) : null}
          {tables.hasNextPage ? (
            <Button onPress={() => void tables.fetchNextPage()}>{t`Load more`}</Button>
          ) : null}
          {tables.isFetchingNextPage ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
          {step === 1 ? (
            <Button
              onPress={() => {
                try {
                  const s = eventLocalToIso(start, zone),
                    e = eventLocalToIso(end, zone);
                  setTable({
                    key: crypto.randomUUID(),
                    gameName: "",
                    input: {
                      name: "",
                      startsAt: s,
                      endsAt: e,
                      minPlayers: 2,
                      maxPlayers: 4,
                      gameId: 0,
                      openSkill: false,
                    },
                  });
                } catch {
                  setError(t`Enter event dates first`);
                }
              }}
            >{t`Add table`}</Button>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      {step < 2 ? (
        <Button
          isDisabled={actions.busy}
          onPress={() => {
            if (step === 0 && !input("DRAFT")) return;
            setError("");
            setStep(step + 1);
          }}
        >{t`Next`}</Button>
      ) : (
        <div className="flex gap-3">
          {event?.status !== "PUBLISHED" ? (
            <Button
              variant="secondary"
              isDisabled={actions.busy}
              onPress={() => submit("DRAFT")}
            >{t`Save draft`}</Button>
          ) : null}
          <Button isDisabled={actions.busy} onPress={() => submit("PUBLISHED")}>
            {event?.status === "PUBLISHED" ? t`Save changes` : t`Publish event`}
          </Button>
        </div>
      )}
      {pending ? (
        <ContactConfirmDialog
          title={t`Reset reservations`}
          description={t`Affected bookings and invitations will be cancelled. Players must request or accept a place again.`}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setPending(null);
          }}
          actions={[
            { label: t`Save changes`, variant: "danger", onPress: () => void save(pending) },
          ]}
        />
      ) : null}
    </section>
  );
}
function TableEditor({
  draft,
  timeZone,
  organizationId,
  onSave,
  onClose,
}: {
  draft: DraftTable;
  timeZone: string;
  organizationId: string;
  onSave: (table: DraftTable) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const o = useCommunityApi();
  const [value, setValue] = useState(draft);
  const [pickGame, setPickGame] = useState(false);
  const [pickDemo, setPickDemo] = useState(false);
  const members = useOrganizationMembers(
    { ...o, enabled: pickDemo && o.enabled !== false },
    organizationId,
    "accepted",
  );
  const [error, setError] = useState("");
  if (pickGame)
    return (
      <SearchGamePage
        {...o}
        token={null}
        onClose={() => setPickGame(false)}
        onSelect={(game) => {
          setValue((row) => ({
            ...row,
            gameName: game.name,
            input: { ...row.input, gameId: game.id },
          }));
          setPickGame(false);
        }}
      />
    );
  if (pickDemo)
    return (
      <section className="flex flex-col gap-3">
        <Button variant="ghost" onPress={() => setPickDemo(false)}>{t`Back`}</Button>
        <Button
          onPress={() => {
            setValue((row) => ({ ...row, input: { ...row.input, demonstratorUserId: undefined } }));
            setPickDemo(false);
          }}
        >{t`No demonstrator`}</Button>
        {members.items.map((member) => (
          <Button
            key={member.userId}
            onPress={() => {
              setValue((row) => ({
                ...row,
                input: { ...row.input, demonstratorUserId: member.userId },
              }));
              setPickDemo(false);
            }}
          >
            {member.username ?? t`Username unavailable`}
          </Button>
        ))}
        {members.isPending || members.isFetchingNextPage ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : null}
        {members.isError ? (
          <Button onPress={() => void members.refetch()}>{t`Retry`}</Button>
        ) : null}
        {members.hasNextPage ? (
          <Button onPress={() => void members.fetchNextPage()}>{t`Load more`}</Button>
        ) : null}
      </section>
    );
  const patch = (next: Partial<EventTableInput>) =>
    setValue((row) => ({ ...row, input: { ...row.input, ...next } }));
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <Button variant="ghost" onPress={onClose}>{t`Back`}</Button>
      <h1>{t`Configure table`}</h1>
      <TextField value={value.input.name} onChange={(name) => patch({ name })}>
        <Label>{t`Table name`}</Label>
        <Input maxLength={120} />
      </TextField>
      <Button onPress={() => setPickGame(true)}>{value.gameName || t`Choose a game`}</Button>
      {(["startsAt", "endsAt"] as const).map((field) => (
        <TextField
          key={field}
          value={eventLocalDateTime(value.input[field], timeZone).slice(0, 16)}
          onChange={(wall) => {
            try {
              patch({ [field]: eventLocalToIso(wall, timeZone, value.input[field]) });
              setError("");
            } catch {
              setError(t`Invalid date or time`);
            }
          }}
        >
          <Label>{field === "startsAt" ? t`Starts at` : t`Ends at`}</Label>
          <Input type="datetime-local" />
        </TextField>
      ))}
      {(["minPlayers", "maxPlayers"] as const).map((field) => (
        <TextField
          key={field}
          value={String(value.input[field])}
          onChange={(n) => patch({ [field]: Number(n) })}
        >
          <Label>{field === "minPlayers" ? t`Minimum players` : t`Maximum players`}</Label>
          <Input type="number" min={2} />
        </TextField>
      ))}
      <Button
        variant="secondary"
        onPress={() => setPickDemo(true)}
      >{t`Choose demonstrator`}</Button>
      <Switch isSelected={value.input.openSkill} onChange={(openSkill) => patch({ openSkill })}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>
          <Label>{t`Global ratings enabled`}</Label>
        </Switch.Content>
      </Switch>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      <Button
        isDisabled={Boolean(error) || !eventTableInputSchema.safeParse(value.input).success}
        onPress={() => onSave(value)}
      >{t`Save table`}</Button>
    </section>
  );
}
