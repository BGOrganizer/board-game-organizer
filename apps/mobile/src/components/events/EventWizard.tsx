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
  useOrganization,
  useOrganizationList,
  useOrganizationMembers,
} from "@board-game-organizer/shared";

import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { Pencil, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { FlatList, ScrollView, View } from "react-native";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import GamePicker from "@/components/games/GamePicker";
import LocationPicker from "@/components/locations/LocationPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDateTimeField } from "./EventDateTimeField";

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

type DraftTable = { key: string; input: EventTableInput; gameName: string };

function Editor({ event, organizationId }: { event?: EventResponse; organizationId: string }) {
  const t = useT();
  const o = useCommunityApi();
  const router = useRouter();
  const actions = useEventActions(o);
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");
  const tables = useEventTables(
    { ...o, enabled: Boolean(event) && o.enabled !== false },
    event?.id ?? "",
  );
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
      const startsAt = eventLocalToIso(start, zone, event?.startsAt),
        endsAt = eventLocalToIso(end, zone, event?.endsAt);
      const raw = {
        name,
        timeZone: zone,
        startsAt,
        endsAt,
        bookingClosesAt: cutoff
          ? eventLocalToIso(cutoff, zone, event?.bookingClosesAt)
          : defaultEventBookingClosesAt(startsAt),
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
      setError(t("Check event name, dates, time zone, verified address and tables"));
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
      router.dismissTo(`/event/${row.id}`);
    } catch {
      setPending(null);
      setError(
        t(
          "Could not save event. Publication requires an approved organization and configured deadline service.",
        ),
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
  const rows = [
    ...tables.items
      .filter((row) => !removed.includes(row.id) && !edited.some((d) => d.input.id === row.id))
      .map((row) => ({ key: row.id, input: editableEventTable(row), gameName: row.gameName })),
    ...edited,
  ];
  const header = (
    <View style={{ gap: 16 }}>
      <Stack.Screen
        options={{ title: event ? t("Edit event") : t("New event"), headerLeft: undefined }}
      />
      <Typography>
        {step === 0 ? t("Event information") : step === 1 ? t("Tables") : t("Review event")}
      </Typography>
      {step === 0 ? (
        <>
          <Typography>{t("Event name")}</Typography>
          <Input
            accessibilityLabel={t("Event name")}
            value={name}
            onChangeText={setName}
            maxLength={120}
          />
          <Typography>{t("Time zone")}</Typography>
          <Input
            accessibilityLabel={t("Time zone")}
            value={zone}
            onChangeText={setZone}
            autoCapitalize="none"
          />
          <EventDateTimeField label={t("Starts at")} value={start} onChange={setStart} />
          <EventDateTimeField label={t("Ends at")} value={end} onChange={setEnd} />
          <EventDateTimeField label={t("Booking deadline")} value={cutoff} onChange={setCutoff} />
          <Typography className="text-muted">
            {t("Default booking deadline is 24 hours before the event starts")}
          </Typography>
          <Button variant="secondary" onPress={() => setPickLocation(true)}>
            {location?.name ?? t("Choose a verified address")}
          </Button>
          {location ? <Typography>{location.address}</Typography> : null}
        </>
      ) : (
        <>
          <Typography>
            {name} · {zone}
          </Typography>
          <Typography>
            {start} – {end}
          </Typography>
          <Typography>{location?.name}</Typography>
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
          onPress={() => {
            try {
              setTable({
                key: `new-${Date.now()}-${Math.random()}`,
                gameName: "",
                input: {
                  name: "",
                  startsAt: eventLocalToIso(start, zone),
                  endsAt: eventLocalToIso(end, zone),
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
          {t("Add table")}
        </Button>
      ) : null}
      {step < 2 ? (
        <Button
          isDisabled={actions.busy}
          onPress={() => {
            if (step === 0 && !input("DRAFT")) return;
            setError("");
            setStep(step + 1);
          }}
        >
          {t("Next")}
        </Button>
      ) : (
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
      )}
      {step ? (
        <Button variant="ghost" onPress={() => setStep(step - 1)}>
          {t("Back")}
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
  return (
    <View style={{ flex: 1 }}>
      {step === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}
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
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 120 }}
          onEndReached={() => {
            if (tables.hasNextPage && !tables.isFetchingNextPage && !tables.isFetchNextPageError)
              void tables.fetchNextPage();
          }}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          renderItem={({ item: row }) => (
            <View className="bg-surface" style={{ padding: 12, borderRadius: 12, gap: 8 }}>
              <Typography className="font-semibold">{row.input.name}</Typography>
              <Typography>
                {row.gameName} · {row.input.minPlayers}–{row.input.maxPlayers}
              </Typography>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  isIconOnly
                  variant="outline"
                  size="sm"
                  accessibilityLabel={`${t("Edit table")}: ${row.input.name}`}
                  onPress={() => setTable(row)}
                >
                  <Pencil size={18} color={foreground} />
                </Button>
                <Button
                  size="sm"
                  isIconOnly
                  accessibilityLabel={`${t("Remove table")}: ${row.input.name}`}
                  variant="danger-soft"
                  onPress={() => {
                    if (row.input.id) setRemoved((ids) => [...ids, row.input.id!]);
                    setEdited((list) => list.filter((d) => d.key !== row.key));
                  }}
                >
                  <Trash2 size={18} color={danger} />
                </Button>
              </View>
            </View>
          )}
        />
      )}
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
    </View>
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
  const t = useT();
  const o = useCommunityApi();
  const [value, setValue] = useState(draft);
  const [pickGame, setPickGame] = useState(false);
  const [pickDemo, setPickDemo] = useState(false);
  const [error, setError] = useState("");
  const members = useOrganizationMembers(
    { ...o, enabled: pickDemo && o.enabled !== false },
    organizationId,
    "accepted",
  );
  const patch = (input: Partial<EventTableInput>) =>
    setValue((row) => ({ ...row, input: { ...row.input, ...input } }));
  if (pickGame)
    return (
      <GamePicker
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
      <FlatList
        style={{ flex: 1 }}
        data={members.items}
        keyExtractor={(row) => row.userId}
        contentContainerStyle={{ padding: 20, gap: 12 }}
        onEndReached={() => {
          if (members.hasNextPage && !members.isFetchingNextPage && !members.isFetchNextPageError)
            void members.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Button variant="ghost" onPress={() => setPickDemo(false)}>
              {t("Back")}
            </Button>
            <Button
              onPress={() => {
                patch({ demonstratorUserId: undefined });
                setPickDemo(false);
              }}
            >
              {t("No demonstrator")}
            </Button>
          </View>
        }
        ListFooterComponent={
          <View>
            {members.isPending || members.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
            {members.isError ? (
              <Button onPress={() => void members.refetch()}>{t("Retry")}</Button>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Button
            onPress={() => {
              patch({ demonstratorUserId: item.userId });
              setPickDemo(false);
            }}
          >
            {item.username ?? t("Username unavailable")}
          </Button>
        )}
      />
    );
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: t("Configure table"),
          headerBackVisible: false,
          headerLeft: () => (
            <Button variant="ghost" onPress={onClose}>
              {t("Back")}
            </Button>
          ),
        }}
      />
      <Typography>{t("Table name")}</Typography>
      <Input
        accessibilityLabel={t("Table name")}
        value={value.input.name}
        onChangeText={(name) => patch({ name })}
        maxLength={120}
      />
      <Button onPress={() => setPickGame(true)}>{value.gameName || t("Choose a game")}</Button>
      {(["startsAt", "endsAt"] as const).map((field) => (
        <EventDateTimeField
          key={field}
          label={field === "startsAt" ? t("Starts at") : t("Ends at")}
          value={eventLocalDateTime(value.input[field], timeZone).slice(0, 16)}
          onChange={(wall) => {
            try {
              patch({ [field]: eventLocalToIso(wall, timeZone, value.input[field]) });
              setError("");
            } catch {
              setError(t("Invalid date or time"));
            }
          }}
        />
      ))}
      {(["minPlayers", "maxPlayers"] as const).map((field) => (
        <View key={field} style={{ gap: 6 }}>
          <Typography>
            {field === "minPlayers" ? t("Minimum players") : t("Maximum players")}
          </Typography>
          <Input
            accessibilityLabel={
              field === "minPlayers" ? t("Minimum players") : t("Maximum players")
            }
            value={String(value.input[field])}
            keyboardType="number-pad"
            onChangeText={(n) => patch({ [field]: Number(n) })}
          />
        </View>
      ))}
      <Button variant="secondary" onPress={() => setPickDemo(true)}>
        {t("Choose demonstrator")}
      </Button>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Typography>{t("Global ratings enabled")}</Typography>
        <Switch
          accessibilityLabel={t("Global ratings enabled")}
          isSelected={value.input.openSkill}
          onSelectedChange={(openSkill) => patch({ openSkill })}
        />
      </View>
      {error ? <Typography className="text-danger">{error}</Typography> : null}
      <Button
        isDisabled={Boolean(error) || !eventTableInputSchema.safeParse(value.input).success}
        onPress={() => onSave(value)}
      >
        {t("Save table")}
      </Button>
    </ScrollView>
  );
}
