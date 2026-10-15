"use client";
import {
  type EventResponse,
  MAX_EVENT_TABLES,
  type MatchLocation,
  type SaveEventInput,
  saveEventSchema,
  updateEventSchema,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  EVENT_FIELD_ERRORS,
  type EventDraftTable,
  type EventFormErrors,
  editableEventTable,
  eventBookingHours,
  eventDateLimit,
  eventDraftTableCount,
  eventEditResets,
  eventInformationForm,
  eventLocalDateTime,
  eventLocalToIso,
  eventOnDay,
  eventSaveFieldErrors,
  eventTableForm,
  formatLocationAddress,
  useEvent,
  useEventActions,
  useEventTables,
  useEventWindow,
  useFavoriteLocations,
  useOrganization,
  useOrganizationList,
} from "@board-game-organizer/shared";
import { Button, FieldError, Input, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, ArrowRight, LayoutGrid, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { WizardSteps } from "@/components/common/ui/WizardSteps";
import { LocationFavoriteButton } from "@/components/locations/LocationFavoriteButton";
import { SearchLocationPage } from "@/components/locations/SearchLocationPage";
import { eventWizardBackHref } from "@/lib/events/eventWizardBackHref";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventDraftTableCard } from "./EventDraftTableCard";
import { EventTableEditor } from "./EventTableEditor";
import { EventWizardSummary } from "./EventWizardSummary";

function WizardHeader({
  eventId,
  organizationId,
  children,
}: {
  eventId?: string;
  organizationId?: string;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center gap-3">
      <Link
        href={eventWizardBackHref(eventId, organizationId)}
        aria-label={t`Back`}
        data-testid="event-wizard-header-back"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-default/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      {children}
    </header>
  );
}

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
    return (
      <>
        <WizardHeader organizationId={chosen} />
        {organization.isPending ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <div role="alert">
            <p>{t`Organization admin required`}</p>
            <Button onPress={() => void organization.refetch()}>{t`Retry`}</Button>
          </div>
        )}
      </>
    );
  if (
    eventId &&
    (communityAccessDenied(detail.error) ||
      !detail.data ||
      detail.data.role !== "admin" ||
      !detail.data.canModify)
  )
    return (
      <>
        <WizardHeader eventId={eventId} />
        {detail.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <div role="alert">
            <p>{t`Event cannot be edited`}</p>
            <Button onPress={() => void detail.refetch()}>{t`Retry`}</Button>
          </div>
        )}
      </>
    );
  if (!eventId && !chosen)
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-4">
        <WizardHeader>
          <h1>{t`Choose an organization`}</h1>
        </WizardHeader>
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
type DraftTable = EventDraftTable;
function Editor({ event, organizationId }: { event?: EventResponse; organizationId: string }) {
  const { t, i18n } = useLingui();
  const o = useCommunityApi();
  const router = useRouter();
  const actions = useEventActions(o);
  const tables = useEventTables(
    { ...o, enabled: Boolean(event) && o.enabled !== false },
    event?.id ?? "",
  );
  const [step, setStep] = useState(0);
  const [name, setName] = useState(event?.name ?? "");
  const [zone] = useState(event?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [start, setStart] = useState(
    event ? eventLocalDateTime(event.startsAt, event.timeZone).slice(0, 16) : "",
  );
  const [end, setEnd] = useState(
    event ? eventLocalDateTime(event.endsAt, event.timeZone).slice(0, 16) : "",
  );
  const [day, setDay] = useState(
    event ? eventLocalDateTime(event.startsAt, event.timeZone).slice(0, 10) : "",
  );
  const changeDay = (wall: string) => {
    const next = wall.slice(0, 10);
    setDay(next);
    setStart((current) => eventOnDay(current, next));
    setEnd((current) => eventOnDay(current, next));
  };
  const [bookingHours, setBookingHours] = useState(() => eventBookingHours(event));
  const [location, setLocation] = useState<MatchLocation | undefined>(event?.location);
  const favorites = useFavoriteLocations(o, location ? [location] : []);
  const [pickLocation, setPickLocation] = useState(false);
  const [edited, setEdited] = useState<DraftTable[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [table, setTable] = useState<DraftTable | null>(null);
  const tableCount = eventDraftTableCount(event?.tableCount ?? 0, edited, removed);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<EventFormErrors>({});
  const fieldError = (field: string) =>
    errors[field] ? (
      <p role="alert" className="text-sm text-danger">
        {i18n._(errors[field])}
      </p>
    ) : null;
  const [pending, setPending] = useState<SaveEventInput | null>(null);
  const mutable = useEventWindow(event);
  function input(status: "DRAFT" | "PUBLISHED"): SaveEventInput | null {
    const information = eventInformationForm(
      { name, start, end, zone, bookingHours, location },
      event,
      Date.now(),
    );
    setErrors(information.errors);
    if (!information.data) {
      setStep(0);
      return null;
    }
    const raw = { ...information.data, status, tables: edited.map((row) => row.input) };
    const parsed = event
      ? updateEventSchema.safeParse({ ...raw, version: event.version, removedTableIds: removed })
      : saveEventSchema.safeParse(raw);
    const invalidEdited = edited.some(
      (row) =>
        !eventTableForm({
          input: row.input,
          start: eventLocalDateTime(row.input.startsAt, zone).slice(0, 16),
          end: eventLocalDateTime(row.input.endsAt, zone).slice(0, 16),
          zone,
          eventStart: raw.startsAt,
          eventEnd: raw.endsAt,
        }).data,
    );
    const outsideRetained = tables.items
      .filter((row) => !removed.includes(row.id) && !edited.some((d) => d.input.id === row.id))
      .some(
        (row) =>
          Date.parse(row.startsAt) <= Date.parse(raw.startsAt) ||
          Date.parse(row.endsAt) >= Date.parse(raw.endsAt),
      );
    if (!parsed.success || invalidEdited || outsideRetained || tableCount > MAX_EVENT_TABLES) {
      setErrors({
        tables:
          tableCount > MAX_EVENT_TABLES
            ? "An event can have at most 20 tables."
            : EVENT_FIELD_ERRORS.tables,
      });
      setStep(1);
      return null;
    }
    return parsed.data;
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
    } catch (failure) {
      setPending(null);
      const fields = eventSaveFieldErrors(failure);
      if (Object.keys(fields).length) {
        setErrors(fields);
        setStep(fields.tables ? 1 : 0);
      } else
        setError(
          t`Could not save event. Check your connection and event permissions, then try again.`,
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
      <EventTableEditor
        key={table.key}
        draft={table}
        eventStart={eventLocalToIso(start, zone, event?.startsAt)}
        eventEnd={eventLocalToIso(end, zone, event?.endsAt)}
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
    .map((row) => ({
      key: row.id,
      input: editableEventTable(row),
      gameName: row.gameName,
      imageUrl: row.image,
      demonstrator: row.demonstrator ?? undefined,
    }));
  const rows = [...loaded, ...edited];
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <WizardHeader eventId={event?.id} organizationId={organizationId}>
        <h1 className="text-xl font-semibold">{event ? t`Edit event` : t`New event`}</h1>
      </WizardHeader>
      <WizardSteps current={step + 1} count={3} />
      {step === 0 ? <h2 className="font-semibold">{t`Event detail`}</h2> : null}
      {step === 0 ? (
        <>
          <TextField value={name} onChange={setName} isInvalid={Boolean(errors.name)}>
            <SearchHelpLabel
              label={t`Event name`}
              htmlFor="event-name"
              helpTitle={t`Field help`}
              help={t`Choose an event name with 5–120 characters.`}
            />
            <Input
              id="event-name"
              name="event-name"
              maxLength={120}
              placeholder={t`e.g. Board game evening`}
            />
            <FieldError>
              <span role="alert">{errors.name ? i18n._(errors.name) : null}</span>
            </FieldError>
          </TextField>
          <EventDateTimeField
            mode="date"
            label={t`Event date`}
            value={day ? `${day}T00:00` : ""}
            help={t`Choose the event day. Start and end must be on this same local day.`}
            onChange={changeDay}
          />
          <SearchHelpLabel
            label={t`Start/end time`}
            helpTitle={t`Field help`}
            help={t`Choose the start and end times on the event day. End must be after start.`}
          />
          <div className="grid grid-cols-2 gap-3">
            <EventDateTimeField
              mode="time"
              day={day}
              label={t`Start time`}
              value={start}
              max={
                end
                  ? eventDateLimit(end, zone, "before", event?.endsAt)
                  : day
                    ? `${day}T23:58`
                    : undefined
              }
              error={errors.startsAt ? i18n._(errors.startsAt) : undefined}
              onChange={setStart}
            />
            <EventDateTimeField
              mode="time"
              day={day}
              label={t`End time`}
              value={end}
              min={eventDateLimit(start, zone, "after", event?.startsAt)}
              max={day ? `${day}T23:59` : undefined}
              error={errors.endsAt ? i18n._(errors.endsAt) : undefined}
              onChange={setEnd}
            />
          </div>
          <SearchHelpLabel
            label={t`Location`}
            helpTitle={t`Field help`}
            help={t`Choose a verified event address from search or your favorites.`}
          />
          <GroupedList>
            <GroupedRow>
              {location ? (
                <LocationFavoriteButton location={location} favorites={favorites} />
              ) : (
                <MapPin className="size-5 shrink-0 text-default-500" aria-hidden />
              )}
              <Button
                variant="ghost"
                className="h-auto min-h-11 min-w-0 flex-1 justify-start text-left"
                aria-label={t`Choose the event address`}
                onPress={() => setPickLocation(true)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {location?.name ?? t`Choose the event address`}
                  </span>
                  {location ? (
                    <span
                      className="block truncate text-xs text-default-500"
                      title={location.address}
                    >
                      {formatLocationAddress(location.address)}
                    </span>
                  ) : null}
                </span>
              </Button>
            </GroupedRow>
          </GroupedList>
          {fieldError("location")}
          {favorites.status.isError ? (
            <p role="alert" className="text-danger">{t`Could not load favorite locations`}</p>
          ) : null}
          <TextField
            value={bookingHours}
            onChange={setBookingHours}
            isInvalid={Boolean(errors.bookingHours)}
          >
            <SearchHelpLabel
              label={t`Booking deadline`}
              htmlFor="event-booking-hours"
              helpTitle={t`Field help`}
              help={t`Hours before the event starts. Default: 24 hours. Bookings and changes close at this exact deadline.`}
            />
            <div className="flex items-center gap-2">
              <Input
                id="event-booking-hours"
                aria-label={t`Booking deadline (hours before start)`}
                type="number"
                min={0}
                step="any"
                className="w-28 flex-none"
              />
              <span className="text-sm text-default-500">{t`hours`}</span>
            </div>
            <FieldError>
              <span role="alert">{errors.bookingHours ? i18n._(errors.bookingHours) : null}</span>
            </FieldError>
          </TextField>
        </>
      ) : (
        <>
          <EventWizardSummary
            startsAt={eventLocalToIso(start, zone, event?.startsAt)}
            endsAt={eventLocalToIso(end, zone, event?.endsAt)}
            timeZone={zone}
            name={step === 2 ? name : undefined}
            location={step === 2 ? location : undefined}
          />
          {step === 1 ? (
            <SearchHelpLabel
              label={t`Tables`}
              helpTitle={t`Field help`}
              help={t`Add up to 20 tables with a game, player limits and times strictly inside the event. Publishing requires at least one table.`}
            />
          ) : (
            <h2 className="font-semibold">{t`Tables`}</h2>
          )}
          {fieldError("tables")}
          {event ? (
            <p>{t`Unloaded tables are retained. Only explicit removals delete tables.`}</p>
          ) : null}
          {tables.isPending && event ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
          {!rows.length && !tables.isError && !(event && tables.isPending) ? (
            <EmptyList
              icon={<LayoutGrid className="size-7" />}
            >{t`No tables yet. Add a table to organize games and players.`}</EmptyList>
          ) : null}
          {rows.map((row) => (
            <EventDraftTableCard
              key={row.key}
              table={row}
              timeZone={zone}
              busy={actions.busy}
              onEdit={() => setTable(row)}
              onRemove={() => {
                const id = row.input.id;
                if (id) setRemoved((ids) => [...ids, id]);
                setEdited((list) => list.filter((d) => d.key !== row.key));
              }}
            />
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
              size="sm"
              className="w-fit self-start"
              isDisabled={tableCount >= MAX_EVENT_TABLES || actions.busy}
              onPress={() => {
                if (tableCount >= MAX_EVENT_TABLES) return;
                try {
                  const s = eventLocalToIso(
                      eventDateLimit(start, zone, "after", event?.startsAt) ?? "",
                      zone,
                    ),
                    e = eventLocalToIso(
                      eventDateLimit(end, zone, "before", event?.endsAt) ?? "",
                      zone,
                    );
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
            >
              <Plus className="size-4" aria-hidden />
              {t`Add table`}
            </Button>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      <div data-testid="event-navigation-bar" className="contents">
        <div className="mx-auto flex w-full max-w-3xl gap-3">
          {step < 2 ? (
            <Button
              isIconOnly
              aria-label={t`Next`}
              className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg"
              isDisabled={actions.busy}
              onPress={() => {
                if (step === 0 && !input("DRAFT")) return;
                setError("");
                setStep(step + 1);
              }}
            >
              <ArrowRight className="size-6" aria-hidden />
            </Button>
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
        </div>
      </div>
      {step > 0 ? (
        <Button
          isIconOnly
          variant="secondary"
          className="fixed bottom-6 left-6 z-40 size-14 rounded-full shadow-lg"
          aria-label={t`Back`}
          isDisabled={actions.busy}
          onPress={() => setStep(step - 1)}
        >
          <ArrowLeft className="size-6" aria-hidden />
        </Button>
      ) : null}
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
