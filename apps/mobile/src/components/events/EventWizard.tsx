import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  eventDateWall,
  useEventRecord,
  useEventRecordActions,
  useEventRecordForm,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Dices,
  Plus,
  Save,
  Trash2,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { BackHandler, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import GamePicker from "@/components/games/GamePicker";
import { GroupMemberPicker } from "@/components/groups/GroupMemberPicker";
import LocationPicker from "@/components/locations/LocationPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDraftTableCard } from "./EventDraftTableCard";
import { EventDraftTableEditor } from "./EventDraftTableEditor";
import { EventScheduleFields } from "./EventScheduleFields";
import { EventWizardSummary } from "./EventWizardSummary";

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
  return (
    <Editor
      key={eventId ?? groupId ?? "new"}
      event={eventId ? q.data : undefined}
      groupId={groupId}
    />
  );
}
function Editor({ event, groupId }: { event?: PlannedEventResponse; groupId?: string }) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    [fg, accentForeground, dangerForeground] = useThemeColor([
      "foreground",
      "accent-foreground",
      "danger-foreground",
    ]),
    form = useEventRecordForm(o, event, groupId),
    a = useEventRecordActions(o, event?.id ?? "");
  const [pick, setPick] = useState<
      { kind: "game" | "demonstrator"; key: string } | "location" | null
    >(null),
    [remove, setRemove] = useState<string | null>(null),
    [serverError, setServerError] = useState(false);
  const { draft, step } = form,
    publicGroup = (form.group?.type ?? event?.groupType) === "PUBLIC";
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
      if (event) router.dismissTo({ pathname: "/event/[eventId]", params: { eventId: result.id } });
      else if (result.groupId)
        router.dismissTo({
          pathname: "/group/[groupId]",
          params: { groupId: result.groupId, tab: "events" },
        });
      else router.dismissTo("/(tabs)/events");
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
              demonstratorAvatarUrl: person.avatarUrl,
            });
            setPick(null);
          }}
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
        <EventScheduleFields form={form} busy={a.busy} onLocation={() => setPick("location")} />
      ) : step === 1 ? (
        <>
          <Button variant="outline" isDisabled={a.busy} onPress={form.addTable}>
            <Plus size={18} color={fg} />
            <Button.Label>{t("Add table")}</Button.Label>
          </Button>
          {form.fieldError("tables") && !draft.tables.length ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Add at least one table.")}
            </Typography>
          ) : null}
        </>
      ) : (
        <EventWizardSummary
          draft={draft}
          groupName={form.group?.name ?? event?.groupName}
          publicGroup={publicGroup}
        />
      )}
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: event ? t("Edit event") : t("Create event"),
          headerTitle: ({ children }) => <HeaderTitle title={children} icon={Dices} />,
          gestureEnabled: true,
          headerLeft: undefined,
          headerBackVisible: true,
        }}
      />
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 32,
          paddingBottom: 12,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {[t("Event"), t("Tables"), t("Review")].map((label, index) => (
          <Button
            key={label}
            size="sm"
            variant={step === index ? "primary" : "ghost"}
            accessibilityState={{ selected: step === index }}
            isDisabled={a.busy || index > step}
            onPress={() => form.goToStep(index)}
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
        renderItem={({ item: row, index }) =>
          step === 1 ? (
            <EventDraftTableEditor
              row={row}
              publicGroup={publicGroup}
              timeZone={draft.timeZone}
              eventStartWall={draft.dates[0] ? eventDateWall(draft, draft.dates[0]) : ""}
              eventEndWall={draft.endsWall}
              busy={a.busy}
              fieldError={(path) => form.fieldError(`tables.${index}.${path}`)}
              onChange={(value) => form.patchTable(row.key, value)}
              onRemove={() => setRemove(row.key)}
              onGame={() => setPick({ kind: "game", key: row.key })}
              onDemonstrator={() => setPick({ kind: "demonstrator", key: row.key })}
            />
          ) : (
            <EventDraftTableCard row={row} publicGroup={publicGroup} />
          )
        }
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {step > 0 && event && form.tables.isPending ? (
              <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
            ) : null}
            {step > 0 && form.tables.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load tables")}
                </Typography>
                <Button onPress={() => void form.tables.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </>
            ) : null}
            {step > 0 && form.tables.hasNextPage ? (
              <Button
                isDisabled={form.tables.isFetchingNextPage}
                onPress={() => void form.tables.fetchNextPage()}
              >
                <Button.Label>{t("Load more tables")}</Button.Label>
              </Button>
            ) : null}
            {step === 2 ? (
              <Typography className="text-muted">
                {t(
                  "Nothing is saved until final confirmation. The organizer has no automatic playing seat.",
                )}
              </Typography>
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
          justifyContent: step > 0 ? "space-between" : "flex-end",
        }}
      >
        {step > 0 ? (
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("Back")}
            isDisabled={a.busy}
            onPress={() => form.goToStep(step - 1)}
          >
            <ArrowLeft size={20} color={fg} />
          </Button>
        ) : null}
        {step < 2 ? (
          <Button
            isIconOnly
            variant="primary"
            accessibilityLabel={t("Next")}
            isDisabled={a.busy || form.closed || form.conflict || !form.canNext}
            onPress={form.next}
          >
            <ArrowRight size={20} color={accentForeground} />
          </Button>
        ) : (
          <Button
            isIconOnly
            variant="primary"
            accessibilityLabel={event ? t("Save event") : t("Create event")}
            isDisabled={
              a.busy ||
              form.conflict ||
              form.closed ||
              (!!draft.groupId && (!form.group?.canInvite || form.group.role !== "admin"))
            }
            onPress={() => void save()}
          >
            {event ? (
              <Save size={20} color={accentForeground} />
            ) : (
              <CalendarPlus size={20} color={accentForeground} />
            )}
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
              icon: <Trash2 size={18} color={dangerForeground} />,
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
