import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useEventRecord,
  useEventRecordActions,
  useEventRecordForm,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { ArrowLeft, Plus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { BackHandler, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { ListSearch } from "@/components/common/ui/ListSearch";
import GamePicker from "@/components/games/GamePicker";
import { GroupMemberPicker } from "@/components/groups/GroupMemberPicker";
import { LocationListRow } from "@/components/locations/LocationListRow";
import LocationPicker from "@/components/locations/LocationPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventDraftTableEditor } from "./EventDraftTableEditor";
import { EventWallDateTime } from "./EventWallDateTime";
export function EventWizard({ eventId, groupId }: { eventId?: string; groupId?: string }) {
  const t = useT(),
    o = useCommunityApi(),
    q = useEventRecord({ ...o, enabled: o.enabled !== false && !!eventId }, eventId ?? "");
  if (
    eventId &&
    (communityAccessDenied(q.error) || !q.data || q.isPlaceholderData || !q.data.canEdit)
  )
    return (
      <View style={{ padding: 20 }}>
        {q.isPending || q.isPlaceholderData ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not edit event")}
            </Typography>
            <Button onPress={() => void q.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        )}
      </View>
    );
  return <Editor key={eventId ?? "new"} event={eventId ? q.data : undefined} groupId={groupId} />;
}
function Editor({ event, groupId }: { event?: PlannedEventResponse; groupId?: string }) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    fg = useThemeColor("foreground"),
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
    publicGroup = form.group?.type === "PUBLIC",
    draft = form.draft;
  useEffect(() => {
    if (!pick) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setPick(null);
      return true;
    });
    return () => listener.remove();
  }, [pick]);
  const save = async () => {
    const parsed = form.validate();
    if (!parsed.success || a.busy || form.conflict) return;
    setServerError(false);
    try {
      const result =
        "version" in parsed.data
          ? await a.update.mutateAsync(parsed.data)
          : await a.create.mutateAsync(parsed.data);
      router.dismissTo({ pathname: "/event/[eventId]", params: { eventId: result.id } });
    } catch {
      setServerError(true);
    }
  };
  const pickerHeader = (
    <Stack.Screen
      options={{
        title: t("Choose"),
        gestureEnabled: false,
        headerLeft: () => (
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("Back")}
            onPress={() => setPick(null)}
          >
            <ArrowLeft size={20} color={fg} />
          </Button>
        ),
      }}
    />
  );
  if (pick === "location")
    return (
      <View style={{ flex: 1 }}>
        {pickerHeader}
        <LocationPicker
          onSelect={(value) => {
            form.addLocation(value);
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      </View>
    );
  if (pick && typeof pick === "object" && pick.kind === "game")
    return (
      <View style={{ flex: 1 }}>
        {pickerHeader}
        <GamePicker
          onSelect={(game) => {
            form.addGame(pick.key, game);
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      </View>
    );
  if (pick && typeof pick === "object" && pick.kind === "demonstrator" && draft.groupId)
    return (
      <View style={{ flex: 1 }}>
        {pickerHeader}
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
      </View>
    );
  if (pick === "group")
    return (
      <View style={{ flex: 1 }}>
        {pickerHeader}
        <FlatList
          data={owned.items.filter((row) => row.canInvite)}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <ListSearch
                query={f.query}
                onQueryChange={f.setQuery}
                label={t("Search groups")}
                placeholder={t("Search groups")}
                options={[]}
                selected={[]}
                onToggle={f.toggle}
              />
              <Button
                variant="outline"
                onPress={() => {
                  form.patch({ groupId: null, locations: [] });
                  setPick(null);
                }}
              >
                <Button.Label>{t("No group")}</Button.Label>
              </Button>
            </View>
          }
          renderItem={({ item }) => (
            <Button
              variant="outline"
              onPress={() => {
                form.patch({ groupId: item.id, locations: [] });
                setPick(null);
              }}
            >
              <Button.Label>{item.name}</Button.Label>
            </Button>
          )}
          onEndReached={() => {
            if (owned.hasNextPage && !owned.isFetchingNextPage && !owned.isFetchNextPageError)
              void owned.fetchNextPage();
          }}
          ListFooterComponent={
            <View>
              {owned.isPending ? (
                <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
              ) : null}
              {owned.isError ? (
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load groups")}
                </Typography>
              ) : null}
              {owned.hasNextPage ? (
                <Button onPress={() => void owned.fetchNextPage()}>
                  <Button.Label>{t("Load more")}</Button.Label>
                </Button>
              ) : null}
            </View>
          }
        />
      </View>
    );
  const header = (
    <View style={{ gap: 16 }}>
      {form.conflict ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {t("This event changed. Go back and reopen the editor before saving.")}
        </Typography>
      ) : null}
      {step === 0 ? (
        <>
          <Typography className="text-foreground">{t("Event name")}</Typography>
          <Input
            accessibilityLabel={t("Event name")}
            value={draft.name}
            onChangeText={(name) => form.patch({ name })}
            editable={!a.busy}
          />
          {!event ? (
            <Button variant="outline" onPress={() => setPick("group")}>
              <Button.Label>{form.group?.name ?? t("No group")}</Button.Label>
            </Button>
          ) : (
            <Typography className="text-foreground">{form.group?.name ?? t("No group")}</Typography>
          )}
          {draft.groupId && form.groupQuery.isPending ? (
            <Skeleton style={{ width: "100%", height: 60, borderRadius: 12 }} />
          ) : null}
          {draft.groupId &&
          (form.groupQuery.isError || form.group?.role !== "admin" || !form.group?.canInvite) ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("An approved group and its administrator are required.")}
            </Typography>
          ) : null}
          <Typography className="text-foreground">{t("Time zone")}</Typography>
          <Input
            accessibilityLabel={t("Time zone")}
            value={draft.timeZone}
            onChangeText={(timeZone) => form.patch({ timeZone })}
            editable={!a.busy}
          />
          <EventDateTimeField
            label={t("Event day")}
            timeZone={draft.timeZone}
            mode="date"
            value={newDay ? `${newDay}T00:00` : ""}
            onChange={(value) => setNewDay(value.slice(0, 10))}
          />
          <Button
            variant="outline"
            isDisabled={!newDay || (publicGroup && draft.dates.length === 1)}
            onPress={() => {
              form.addDate(newDay);
              setNewDay("");
            }}
          >
            <Button.Label>{t("Add date")}</Button.Label>
          </Button>
          {draft.dates.map((row) => (
            <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {row.day}
              </Typography>
              <Button
                isIconOnly
                variant="danger-soft"
                accessibilityLabel={`${t("Remove date")}: ${row.day}`}
                onPress={() => form.patch({ dates: draft.dates.filter((d) => d.id !== row.id) })}
              >
                <X size={18} color={fg} />
              </Button>
            </View>
          ))}
          <EventDateTimeField
            label={t("Common start time")}
            timeZone={draft.timeZone}
            mode="time"
            day={draft.dates[0]?.day}
            value={draft.dates[0] ? `${draft.dates[0].day}T${draft.startTime}` : ""}
            onChange={(value) => form.patch({ startTime: value.slice(11, 16) })}
          />
          {publicGroup ? (
            <>
              <Typography className="text-muted">
                {t(
                  "Public events have a fixed day and venue. Cutoff and duration constraints apply to players and demonstrators.",
                )}
              </Typography>
              <EventWallDateTime
                label={t("Event end")}
                timeZone={draft.timeZone}
                value={draft.endsWall}
                onChange={(endsWall) => form.patch({ endsWall })}
              />
              <EventWallDateTime
                label={t("Booking cutoff")}
                timeZone={draft.timeZone}
                value={draft.cutoffWall}
                onChange={(cutoffWall) => form.patch({ cutoffWall })}
              />
            </>
          ) : null}
          {draft.locations.map((row) => (
            <View key={row.id} style={{ gap: 8 }}>
              <LocationListRow name={row.name} address={row.address} />
              {!publicGroup ? (
                <Button
                  variant="danger-soft"
                  accessibilityLabel={`${t("Remove location")}: ${row.name}`}
                  onPress={() =>
                    form.patch({ locations: draft.locations.filter((l) => l.id !== row.id) })
                  }
                >
                  <Button.Label>{t("Remove location")}</Button.Label>
                </Button>
              ) : null}
            </View>
          ))}
          {!publicGroup ? (
            <Button variant="outline" onPress={() => setPick("location")}>
              <Button.Label>{t("Add location")}</Button.Label>
            </Button>
          ) : null}
        </>
      ) : step === 1 ? (
        <Button variant="outline" isDisabled={a.busy} onPress={form.addTable}>
          <Plus size={18} color={fg} />
          <Button.Label>{t("Add table")}</Button.Label>
        </Button>
      ) : (
        <>
          <Typography className="font-semibold text-foreground">{draft.name}</Typography>
          <Typography className="text-foreground">
            {draft.dates.map((row) => row.day).join(", ")} · {draft.startTime} ({draft.timeZone})
          </Typography>
          {draft.locations.map((row) => (
            <LocationListRow key={row.id} name={row.name} address={row.address} />
          ))}
          <Typography className="text-muted">
            {t(
              "Nothing is saved until final confirmation. The organizer has no automatic playing seat.",
            )}
          </Typography>
        </>
      )}
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: event ? t("Edit event") : t("Create event"),
          gestureEnabled: true,
          headerLeft: undefined,
        }}
      />
      <View style={{ paddingHorizontal: 20, flexDirection: "row", gap: 8 }}>
        {[t("Event"), t("Tables"), t("Review")].map((label, index) => (
          <Button
            key={label}
            size="sm"
            variant={step === index ? "primary" : "ghost"}
            isDisabled={a.busy}
            onPress={() => setStep(index)}
          >
            <Button.Label>
              {index + 1}. {label}
            </Button.Label>
          </Button>
        ))}
      </View>
      <FlatList
        data={step === 0 ? [] : draft.tables}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }}
        ListHeaderComponent={header}
        renderItem={({ item: row }) =>
          step === 1 ? (
            <EventDraftTableEditor
              row={row}
              publicGroup={publicGroup}
              timeZone={draft.timeZone}
              busy={a.busy}
              onChange={(value) => form.patchTable(row.key, value)}
              onRemove={() => setRemove(row.key)}
              onGame={() => setPick({ kind: "game", key: row.key })}
              onDemonstrator={() => setPick({ kind: "demonstrator", key: row.key })}
            />
          ) : (
            <Typography className="text-foreground">
              {row.name}: {row.minPlayers}–{row.maxPlayers} ·{" "}
              {row.games.map((game) => game.name).join(", ")}
            </Typography>
          )
        }
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {form.tables.isPending && event && step === 1 ? (
              <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
            ) : null}
            {form.tables.isError && step === 1 ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not load tables")}
              </Typography>
            ) : null}
            {form.tables.hasNextPage && step === 1 ? (
              <Button
                isDisabled={form.tables.isFetchingNextPage}
                onPress={() => void form.tables.fetchNextPage()}
              >
                <Button.Label>{t("Load more tables")}</Button.Label>
              </Button>
            ) : null}
            {form.closed ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Bookings are closed")}
              </Typography>
            ) : null}
            {form.error ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Check required fields, dates, player limits, games and durations.")}
              </Typography>
            ) : null}
            {serverError ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t(
                  "Could not save event. Check timing, conflicts and permissions, then try again.",
                )}
              </Typography>
            ) : null}
          </View>
        }
      />
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 16,
          flexDirection: "row",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <Button
          variant="ghost"
          isDisabled={a.busy}
          onPress={() => (step ? setStep(step - 1) : router.back())}
        >
          <Button.Label>{t("Back")}</Button.Label>
        </Button>
        {step < 2 ? (
          <Button isDisabled={a.busy} onPress={() => setStep(step + 1)}>
            <Button.Label>{t("Next")}</Button.Label>
          </Button>
        ) : (
          <Button
            isDisabled={
              a.busy ||
              form.conflict ||
              form.closed ||
              (!!draft.groupId && (!form.group?.canInvite || form.group.role !== "admin"))
            }
            onPress={() => void save()}
          >
            <Button.Label>{event ? t("Save event") : t("Create event")}</Button.Label>
          </Button>
        )}
      </View>
      {remove ? (
        <ConfirmDialog
          title={t("Remove table")}
          description={t(
            "This table and its active registrations will be removed only when you save the event.",
          )}
          busy={a.busy}
          onCancel={() => setRemove(null)}
          actions={[
            {
              label: t("Remove table"),
              variant: "danger",
              onPress: () => {
                form.removeTable(remove);
                setRemove(null);
              },
            },
          ]}
        />
      ) : null}
    </View>
  );
}
