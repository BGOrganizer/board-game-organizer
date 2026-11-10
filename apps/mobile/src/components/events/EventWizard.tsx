import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import type { CreateEventVariables, EditEventVariables } from "@board-game-organizer/shared";
import {
  communityAccessDenied,
  creationState,
  eventDateWall,
  eventRecordKeys,
  isGroupManagerRole,
  useClientMutationDraft,
  useEventCreationDraft,
  useEventRecord,
  useEventRecordActions,
  useEventRecordForm,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Accordion } from "heroui-native/accordion";
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
  Table2,
  Trash2,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderBackButton, headerBackOptions } from "@/components/common/layout/HeaderBackButton";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { FormSubmitButton } from "@/components/common/ui/FormSubmitButton";
import { InputField } from "@/components/common/ui/InputField";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import GamePicker from "@/components/games/GamePicker";
import { GroupMemberPicker } from "@/components/groups/GroupMemberPicker";
import LocationPicker from "@/components/locations/LocationPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useValidationList } from "@/lib/useValidationList";
import { EventDraftTableCard } from "./EventDraftTableCard";
import { EventDraftTableEditor } from "./EventDraftTableEditor";
import { EventInformationFields } from "./EventInformationFields";
import { EventScheduleFields } from "./EventScheduleFields";
import { EventWizardSummary } from "./EventWizardSummary";

export function EventWizard({
  eventId,
  groupId,
  draftId,
  fromGroup,
}: {
  eventId?: string;
  groupId?: string;
  draftId?: string;
  fromGroup?: string;
}) {
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
  if (draftId) return <RecoveredEditor draftId={draftId} />;
  return (
    <FormInteractionScope key={`${o.apiUrl}/${o.userId}/${eventId ?? groupId ?? "new"}`}>
      <Editor event={eventId ? q.data : undefined} groupId={groupId} fromGroup={fromGroup} />
    </FormInteractionScope>
  );
}
function RecoveredEditor({ draftId }: { draftId: string }) {
  const t = useT(),
    o = useCommunityApi(),
    recovery = useEventCreationDraft(o, draftId);
  if (!recovery?.variables.clientDraft || creationState(recovery).phase !== "failed")
    return (
      <Typography accessibilityRole="alert" className="text-danger">
        {t("Could not recover draft")}
      </Typography>
    );
  return (
    <FormInteractionScope key={`${o.apiUrl}/${o.userId}/${draftId}`}>
      <Editor recovery={recovery.variables} groupId={recovery.variables.clientInitialGroupId} />
    </FormInteractionScope>
  );
}
function Editor({
  event,
  groupId,
  recovery,
  fromGroup,
}: {
  event?: PlannedEventResponse;
  groupId?: string;
  recovery?: CreateEventVariables;
  fromGroup?: string;
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    [fg, accentForeground, dangerForeground] = useThemeColor([
      "foreground",
      "accent-foreground",
      "danger-foreground",
    ]),
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
  const [pick, setPick] = useState<
      { kind: "game" | "demonstrator"; key: string } | "location" | null
    >(null),
    [remove, setRemove] = useState<string | null>(null),
    [submitting, setSubmitting] = useState(false),
    [expandedTables, setExpandedTables] = useState<string[]>([]);
  const submitted = useRef(false);
  const { draft, step } = form,
    publicGroup = form.publicGroup;
  useEffect(() => {
    if (step !== 2 || !form.validationAttempt) return;
    setExpandedTables((old) => {
      const next = new Set(old);
      draft.tables.forEach((row, index) => {
        if (form.fieldError(`tables.${index}`)) next.add(row.key);
      });
      return next.size === old.length ? old : [...next];
    });
  }, [step, form.validationAttempt, form.fieldError, draft.tables]);
  const addTable = () => {
    const key = form.addTable();
    if (key) setExpandedTables((old) => [...new Set([...old, key])]);
  };
  const validationScope = JSON.stringify([
    o.apiUrl,
    o.userId,
    event?.id ?? groupId ?? "new",
    event?.version,
    step,
  ]);
  const invalidTable = step === 2 ? /^tables\.(\d+)/.exec(form.firstErrorPath ?? "") : null;
  const validation = useValidationList({
    scope: validationScope,
    attempt: form.validationAttempt,
    index: invalidTable ? Number(invalidTable[1]) : undefined,
    active:
      !pick &&
      (!invalidTable || expandedTables.includes(draft.tables[Number(invalidTable[1])]?.key ?? "")),
  });
  useEffect(() => {
    if (!pick) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setPick(null);
      return true;
    });
    return () => listener.remove();
  }, [pick]);
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
    if (event)
      router.dismissTo({
        pathname: "/event/[eventId]",
        params: { eventId: event.id, ...(fromGroup === event.groupId ? { fromGroup } : {}) },
      });
    else if (targetGroup)
      router.dismissTo({
        pathname: "/group/[groupId]",
        params: { groupId: targetGroup, tab: "events" },
      });
    else router.dismissTo({ pathname: "/(tabs)/events", params: { section: "available" } });
  };
  const pickerHeader = (
    <Stack.Screen
      options={{
        title: t("Choose"),
        gestureEnabled: false,
        headerLeft: () => <HeaderBackButton onPress={() => setPick(null)} />,
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
  if (pick && typeof pick === "object" && pick.kind === "game") {
    const table = draft.tables.find((row) => row.key === pick.key);
    return (
      <View style={{ flex: 1 }}>
        {pickerHeader}
        <GamePicker
          excludeIds={table?.games.map((game) => game.id)}
          tableScope={
            event && table?.id
              ? { eventId: event.id, tableId: table.id, groupId: event.groupId }
              : undefined
          }
          onSelect={(game) => {
            form.addGame(pick.key, game);
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      </View>
    );
  }
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
      {checking ? (
        <Typography accessibilityLiveRegion="polite" className="text-foreground">
          {t("Checking saved changes")}
        </Typography>
      ) : null}
      {form.conflict ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {t("This event changed. Go back and reopen the editor before saving.")}
        </Typography>
      ) : null}
      {step === 0 ? (
        <EventInformationFields form={form} busy={submitting} />
      ) : step === 1 ? (
        <EventScheduleFields form={form} busy={submitting} onLocation={() => setPick("location")} />
      ) : step === 2 ? (
        <InputField invalid={form.fieldError("tables") && !draft.tables.length} style={{ gap: 8 }}>
          {form.fieldError("tables") && !draft.tables.length ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Add at least one table.")}
            </Typography>
          ) : null}
        </InputField>
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
          ...headerBackOptions(() => router.back()),
        }}
      />
      <Accordion
        selectionMode="multiple"
        variant="default"
        value={expandedTables}
        onValueChange={setExpandedTables}
        style={{ flex: 1 }}
      >
        <InputFlatList
          key={validationScope}
          {...validation}
          data={step < 2 ? [] : draft.tables}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }}
          ListHeaderComponent={
            <>
              <View
                style={{
                  paddingTop: 12,
                  paddingBottom: 24,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {[t("Event"), t("Dates / Locations"), t("Tables"), t("Review")].map(
                  (label, index) => (
                    <Button
                      key={label}
                      size="sm"
                      variant={step === index ? "primary" : "ghost"}
                      accessibilityState={{ selected: step === index }}
                      isDisabled={submitting || index > step}
                      onPress={() => form.goToStep(index)}
                    >
                      <Button.Label>
                        {index + 1}. {label}
                      </Button.Label>
                    </Button>
                  ),
                )}
              </View>
              {header}
            </>
          }
          renderItem={({ item: row, index }) =>
            step === 2 ? (
              <Accordion.Item value={row.key} className="rounded-xl bg-default">
                <Accordion.Trigger
                  testID={`event-draft-table-${row.key}`}
                  accessibilityLabel={row.name.trim() || `${t("Table")} #${index + 1}`}
                  isDisabled={submitting}
                  style={{ minHeight: 44 }}
                >
                  <Table2 size={20} color={fg} accessible={false} />
                  <Typography
                    className="font-semibold text-foreground"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {row.name.trim() || `${t("Table")} #${index + 1}`}
                  </Typography>
                  <Accordion.Indicator />
                </Accordion.Trigger>
                <Accordion.Content>
                  <EventDraftTableEditor
                    row={row}
                    privateGroup={form.flexibleSchedule}
                    publicGroup={publicGroup}
                    timeZone={draft.timeZone}
                    eventStartWall={draft.dates[0] ? eventDateWall(draft, draft.dates[0]) : ""}
                    eventEndWall={draft.endsWall}
                    busy={submitting}
                    fieldError={(path) => form.fieldError(`tables.${index}.${path}`)}
                    onChange={(value) => form.patchTable(row.key, value)}
                    onRemove={() => setRemove(row.key)}
                    onGame={() => setPick({ kind: "game", key: row.key })}
                    onDemonstrator={() => setPick({ kind: "demonstrator", key: row.key })}
                  />
                </Accordion.Content>
              </Accordion.Item>
            ) : (
              <EventDraftTableCard row={row} publicGroup={publicGroup} />
            )
          }
          ListFooterComponent={
            <View style={{ gap: 12 }}>
              {step === 2 ? (
                <Button
                  variant="outline"
                  isDisabled={submitting || draft.tables.length >= 20}
                  onPress={addTable}
                >
                  <Plus size={18} color={fg} />
                  <Button.Label>{t("Add table")}</Button.Label>
                </Button>
              ) : null}
              {step >= 2 && event && form.tables.isPending ? (
                <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
              ) : null}
              {step >= 2 && form.tables.isError ? (
                <>
                  <Typography accessibilityRole="alert" className="text-danger">
                    {t("Could not load tables")}
                  </Typography>
                  <Button onPress={() => void form.tables.refetch()}>
                    <Button.Label>{t("Try again")}</Button.Label>
                  </Button>
                </>
              ) : null}
              {step >= 2 && form.tables.hasNextPage ? (
                <Button
                  isDisabled={form.tables.isFetchingNextPage}
                  onPress={() => void form.tables.fetchNextPage()}
                >
                  <Button.Label>{t("Load more tables")}</Button.Label>
                </Button>
              ) : null}
              {step === 3 ? (
                <Typography className="text-muted">
                  {t("The organizer has no automatic playing seat.")}
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
            </View>
          }
        />
      </Accordion>
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
            isDisabled={submitting}
            onPress={() => form.goToStep(step - 1)}
          >
            <ArrowLeft size={20} color={fg} />
          </Button>
        ) : null}
        {step < 3 ? (
          <FormSubmitButton
            isIconOnly
            variant="primary"
            accessibilityLabel={t("Next")}
            isDisabled={submitting || form.closed || form.conflict}
            onPress={form.next}
          >
            <ArrowRight size={20} color={accentForeground} />
          </FormSubmitButton>
        ) : (
          <FormSubmitButton
            isIconOnly
            variant="primary"
            accessibilityLabel={event ? t("Save event") : t("Create event")}
            isDisabled={
              submitting ||
              Boolean(event && (a.busy || checking)) ||
              form.conflict ||
              form.closed ||
              (!!draft.groupId && (!form.group?.canInvite || !isGroupManagerRole(form.group.role)))
            }
            onPress={() => void save()}
          >
            {event ? (
              <Save size={20} color={accentForeground} />
            ) : (
              <CalendarPlus size={20} color={accentForeground} />
            )}
          </FormSubmitButton>
        )}
      </View>
      {remove ? (
        <ConfirmDialog
          title={t("Remove table")}
          description={t(
            "This table and its active registrations will be removed only when you save the event.",
          )}
          busy={submitting}
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
