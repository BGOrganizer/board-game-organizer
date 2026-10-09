import {
  type EventResponse,
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
  eventEditResets,
  eventInformationForm,
  eventLocalDateTime,
  eventLocalToIso,
  eventSaveFieldErrors,
  eventTableForm,
  useEvent,
  useEventActions,
  useEventTables,
  useEventWindow,
  useFavoriteLocations,
  useOrganization,
  useOrganizationList,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  LayoutGrid,
  Plus,
} from "lucide-react-native";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { WizardSteps } from "@/components/common/ui/WizardSteps";
import { LocationFavoriteButton } from "@/components/locations/LocationFavoriteButton";
import { LocationListRow } from "@/components/locations/LocationListRow";
import LocationPicker from "@/components/locations/LocationPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventDraftTableCard } from "./EventDraftTableCard";
import { EventTableEditor } from "./EventTableEditor";

export function EventWizard({
  eventId,
  organizationId,
}: {
  eventId?: string;
  organizationId?: string;
}) {
  const t = useT();
  const o = useCommunityApi();
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
      <View style={{ padding: 20 }}>
        {organization.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : (
          <Button onPress={() => void organization.refetch()}>
            {t("Organization admin required")}
          </Button>
        )}
      </View>
    );
  if (
    eventId &&
    (communityAccessDenied(detail.error) ||
      !detail.data ||
      detail.data.role !== "admin" ||
      !detail.data.canModify)
  )
    return (
      <View style={{ padding: 20 }}>
        {detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : (
          <Button onPress={() => void detail.refetch()}>{t("Event cannot be edited")}</Button>
        )}
      </View>
    );
  if (!eventId && !chosen)
    return (
      <FlatList
        style={{ flex: 1 }}
        data={organizations.items.filter((row) => row.role === "admin")}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: 20, gap: 12 }}
        onEndReached={() => {
          if (
            organizations.hasNextPage &&
            !organizations.isFetchingNextPage &&
            !organizations.isFetchNextPageError
          )
            void organizations.fetchNextPage();
        }}
        ListHeaderComponent={<Typography>{t("Choose an organization")}</Typography>}
        ListEmptyComponent={
          !organizations.isPending && !organizations.isError ? (
            <Typography>{t("Create an organization before creating an event")}</Typography>
          ) : null
        }
        ListFooterComponent={
          <View>
            {organizations.isPending || organizations.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
            {organizations.isError ? (
              <Button onPress={() => void organizations.refetch()}>{t("Retry")}</Button>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <Button onPress={() => setChosen(item.id)}>{item.name}</Button>}
      />
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
  const t = useT();
  const o = useCommunityApi();
  const router = useRouter();
  const actions = useEventActions(o);
  const { i18n } = useLingui();
  const layout = useFloatingActionLayout();
  const foreground = useThemeColor("foreground");
  const accentForeground = useThemeColor("accent-foreground");
  const insets = useSafeAreaInsets();
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
  const [bookingHours, setBookingHours] = useState(() => eventBookingHours(event));
  const [location, setLocation] = useState<MatchLocation | undefined>(event?.location);
  const favorites = useFavoriteLocations(o, location ? [location] : []);
  const [pickLocation, setPickLocation] = useState(false);
  const [edited, setEdited] = useState<DraftTable[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [table, setTable] = useState<DraftTable | null>(null);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<EventFormErrors>({});
  const fieldError = (field: string) =>
    errors[field] ? (
      <Typography className="text-sm text-danger" accessibilityRole="alert">
        {t(errors[field])}
      </Typography>
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
          Date.parse(row.startsAt) < Date.parse(raw.startsAt) ||
          Date.parse(row.endsAt) > Date.parse(raw.endsAt),
      );
    if (!parsed.success || invalidEdited || outsideRetained) {
      setErrors({ tables: EVENT_FIELD_ERRORS.tables });
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
      router.dismissTo(`/event/${row.id}`);
    } catch (failure) {
      setPending(null);
      const fields = eventSaveFieldErrors(failure);
      if (Object.keys(fields).length) {
        setErrors(fields);
        setStep(fields.tables ? 1 : 0);
      } else
        setError(
          t("Could not save event. Check your connection and event permissions, then try again."),
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
      <View style={{ padding: 20, gap: 12 }}>
        <Typography accessibilityRole="alert">
          {t("Bookings are closed. Results can still be recorded.")}
        </Typography>
        <Button onPress={() => router.replace(`/event/${event.id}`)}>{t("Back to event")}</Button>
      </View>
    );
  if (pickLocation)
    return (
      <LocationPicker
        initial={location}
        onSelect={(next) => {
          setLocation(next);
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
  const rows = [
    ...tables.items
      .filter((row) => !removed.includes(row.id) && !edited.some((d) => d.input.id === row.id))
      .map((row) => ({
        key: row.id,
        input: editableEventTable(row),
        gameName: row.gameName,
        imageUrl: row.image,
        demonstrator: row.demonstrator ?? undefined,
      })),
    ...edited,
  ];
  const header = (
    <View style={{ gap: 16 }}>
      <Stack.Screen
        options={{
          title: event ? t("Edit event") : t("New event"),
          headerLeft: undefined,
          headerBackVisible: step > 0,
        }}
      />
      <WizardSteps current={step + 1} count={3} />
      {step === 0 ? (
        <SearchHelpLabel
          label={t("Event information")}
          helpTitle={t("Field help")}
          help={t(
            "Choose a name, a start and a later end (also on another day), and a verified address.",
          )}
        />
      ) : (
        <SearchHelpLabel
          label={step === 1 ? t("Tables") : t("Review event")}
          helpTitle={t("Field help")}
          help={t(
            "Add tables with a game, player limits and times inside the event. Publishing requires at least one table.",
          )}
        />
      )}
      {step === 0 ? (
        <>
          <Typography>{t("Event name")}</Typography>
          <Input
            accessibilityLabel={t("Event name")}
            value={name}
            onChangeText={setName}
            maxLength={120}
            placeholder={t("e.g. Board game evening")}
          />
          {fieldError("name")}
          <EventDateTimeField
            label={t("Starts at")}
            testID="event-start-calendar"
            value={start}
            timeZone={zone}
            error={errors.startsAt ? t(errors.startsAt) : undefined}
            onChange={setStart}
          />
          <EventDateTimeField
            label={t("Ends at")}
            testID="event-end-calendar"
            value={end}
            timeZone={zone}
            min={eventDateLimit(start, zone, "after", event?.startsAt)}
            error={errors.endsAt ? t(errors.endsAt) : undefined}
            onChange={setEnd}
          />
          <SearchHelpLabel
            label={t("Location")}
            helpTitle={t("Field help")}
            help={t("Choose a verified event address from search or your favorites.")}
          />
          <GroupedList>
            <LocationListRow
              name={location?.name ?? t("Choose a verified address")}
              accessibilityLabel={t("Choose a verified address")}
              address={location?.address}
              onPress={() => setPickLocation(true)}
              leading={
                location ? (
                  <LocationFavoriteButton location={location} favorites={favorites} />
                ) : undefined
              }
            />
          </GroupedList>
          {fieldError("location")}
          {favorites.status.isError ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load favorite locations")}
            </Typography>
          ) : null}
          <SearchHelpLabel
            label={t("Booking deadline")}
            helpTitle={t("Field help")}
            help={t(
              "Hours before the event starts. Default: 24 hours. Bookings and changes close at this exact deadline.",
            )}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Input
              style={{ width: 112 }}
              accessibilityLabel={t("Booking deadline (hours before start)")}
              keyboardType="decimal-pad"
              value={bookingHours}
              onChangeText={setBookingHours}
            />
            <Typography className="text-muted">{t("hours")}</Typography>
          </View>
          {fieldError("bookingHours")}
        </>
      ) : (
        <>
          {[
            { label: t("Event start"), wall: start, Icon: CalendarClock },
            { label: t("Event end"), wall: end, Icon: CalendarCheck },
          ].map(({ label, wall, Icon }) => (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon size={20} color={foreground} />
              <View>
                <Typography className="text-sm text-muted">{label}</Typography>
                <Typography className="text-foreground">
                  {new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: zone,
                  }).format(
                    new Date(
                      eventLocalToIso(wall, zone, wall === start ? event?.startsAt : event?.endsAt),
                    ),
                  )}
                </Typography>
              </View>
            </View>
          ))}
          {step === 2 ? (
            <>
              <Typography>{name}</Typography>
              <Typography>
                {location?.name} · {location?.address}
              </Typography>
            </>
          ) : null}
          {fieldError("tables")}
          {event ? (
            <Typography className="text-muted">
              {t("Unloaded tables are retained. Only explicit removals delete tables.")}
            </Typography>
          ) : null}
        </>
      )}
      {error ? (
        <Typography className="text-danger" accessibilityRole="alert">
          {error}
        </Typography>
      ) : null}
    </View>
  );
  const footer = (
    <View style={{ gap: 12 }}>
      {step === 1 ? (
        <Button
          size="sm"
          style={{ alignSelf: "flex-start" }}
          onPress={() => {
            try {
              setTable({
                key: `new-${Date.now()}-${Math.random()}`,
                gameName: "",
                input: {
                  name: "",
                  startsAt: eventLocalToIso(
                    eventDateLimit(start, zone, "after", event?.startsAt) ?? "",
                    zone,
                  ),
                  endsAt: eventLocalToIso(
                    eventDateLimit(end, zone, "before", event?.endsAt) ?? "",
                    zone,
                  ),
                  minPlayers: 2,
                  maxPlayers: 4,
                  gameId: 0,
                  openSkill: false,
                },
              });
            } catch {
              setError(t("Enter event dates first"));
            }
          }}
        >
          <Plus size={18} color={accentForeground} />
          <Button.Label>{t("Add table")}</Button.Label>
        </Button>
      ) : null}
      {event && tables.isError ? (
        <Button onPress={() => void tables.refetch()}>{t("Could not load tables. Retry")}</Button>
      ) : null}
      {(tables.isPending && event) || tables.isFetchingNextPage ? (
        <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
      ) : null}
    </View>
  );
  const navigation =
    step < 2 ? (
      <FloatingActions
        label="Next"
        testID="event-next-fab"
        variant="secondary"
        isDisabled={actions.busy}
        onPress={() => {
          if (step === 0 && !input("DRAFT")) return;
          setError("");
          setStep(step + 1);
        }}
      >
        <ArrowRight size={26} color={foreground} />
      </FloatingActions>
    ) : (
      <View
        testID="event-navigation-bar"
        style={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 24 }}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          {event?.status !== "PUBLISHED" ? (
            <Button variant="secondary" isDisabled={actions.busy} onPress={() => submit("DRAFT")}>
              {t("Save draft")}
            </Button>
          ) : null}
          <Button isDisabled={actions.busy} onPress={() => submit("PUBLISHED")}>
            {event?.status === "PUBLISHED" ? t("Save changes") : t("Publish event")}
          </Button>
        </View>
      </View>
    );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top + 56}
    >
      {step === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: layout.paddingBottom }}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {footer}
        </ScrollView>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: layout.paddingBottom }}
          onEndReached={() => {
            if (tables.hasNextPage && !tables.isFetchingNextPage && !tables.isFetchNextPageError)
              void tables.fetchNextPage();
          }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            !tables.isError && !(event && tables.isPending) ? (
              <EmptyList icon={<LayoutGrid size={28} color={foreground} />}>
                {t("No tables yet. Add a table to organize games and players.")}
              </EmptyList>
            ) : null
          }
          ListFooterComponent={footer}
          renderItem={({ item: row }) => (
            <EventDraftTableCard
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
          )}
        />
      )}
      {navigation}
      {step > 0 ? (
        <FloatingActions
          label="Back"
          testID="event-back-fab"
          left
          variant="secondary"
          isDisabled={actions.busy}
          onPress={() => setStep(step - 1)}
        >
          <ArrowLeft size={26} color={foreground} />
        </FloatingActions>
      ) : null}
      {pending ? (
        <CommunityConfirm
          title={t("Reset reservations")}
          description={t(
            "Affected bookings and invitations will be cancelled. Players must request or accept a place again.",
          )}
          busy={actions.busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void save(pending)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
