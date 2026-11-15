import type {
  DeletePlannedRecordInput,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  canManageEvent,
  eventRecordKeys,
  useClientMutationDraft,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Trash2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { HEADER_ICON_SIZE, headerButtonProps } from "@/components/common/layout/headerStyles";
import { ClientRecordBadge } from "@/components/common/ui/ClientRecordBadge";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventDeleteAction({
  event,
  table,
  disabled = false,
}: {
  event: PlannedEventResponse;
  table?: PlannedTableResponse;
  disabled?: boolean;
}) {
  const t = useT(),
    options = useCommunityApi(),
    actions = useEventRecordActions(options, event.id),
    router = useRouter();
  const { height } = useWindowDimensions();
  const danger = useThemeColor("danger-soft-foreground"),
    foreground = useThemeColor("danger-foreground");
  const intent = useClientMutationDraft<DeletePlannedRecordInput & { tableId?: string }>(
    eventRecordKeys.mutation(options, event.id, table ? "remove-table" : "remove"),
    event.version,
    (input) => input?.tableId === table?.id,
  );
  const verifying = intent?.phase === "verifying";
  const [confirm, setConfirm] = useState<number | null>(null),
    submitted = useRef(false);
  const allowed =
    !event.readOnly &&
    !table?.readOnly &&
    canManageEvent(event, options.userId) &&
    event.status === "PLANNING" &&
    (!table ||
      (canManageEvent(table, options.userId) &&
        table.eventId === event.id &&
        table.eventStatus === "PLANNING"));
  const blocked =
    disabled ||
    actions.busy ||
    verifying ||
    !event.canEdit ||
    Boolean(table && event.tableCount <= 1);
  useEffect(() => {
    if (confirm !== null && (!allowed || blocked || confirm !== event.version)) setConfirm(null);
  }, [allowed, blocked, confirm, event.version]);
  if (!allowed) return null;
  const label = table ? t("Delete table") : t("Delete event");
  const remove = () => {
    if (submitted.current || blocked || confirm !== event.version) return;
    submitted.current = true;
    if (table) actions.removeTable.mutate({ tableId: table.id, version: event.version });
    else actions.remove.mutate({ version: event.version });
    setConfirm(null);
    if (table) router.dismissTo({ pathname: "/event/[eventId]", params: { eventId: event.id } });
    else if (event.groupId)
      router.dismissTo({
        pathname: "/group/[groupId]",
        params: { groupId: event.groupId, tab: "events" },
      });
    else router.dismissTo("/(tabs)/events");
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {verifying ? <ClientRecordBadge phase="verifying" iconSize={HEADER_ICON_SIZE} /> : null}
      {blocked ? (
        <HelpPopover
          label={label}
          title={t("Deletion availability")}
          icon={Trash2}
          triggerVariant="danger-soft"
          triggerClassName="opacity-60"
        >
          <ScrollView
            style={{ maxHeight: Math.min(320, height * 0.5) }}
            contentContainerStyle={{ gap: 8 }}
          >
            {table && event.tableCount <= 1 ? (
              <Typography className="text-foreground">
                {t("An event must keep at least one table. Delete the event instead.")}
              </Typography>
            ) : null}
            {!event.canEdit ? (
              <Typography className="text-foreground">
                {t("This event can no longer be edited.")}
              </Typography>
            ) : null}
            {disabled ? (
              <Typography className="text-foreground">
                {t("Wait until current event and table data are verified.")}
              </Typography>
            ) : null}
            {actions.busy ? (
              <Typography className="text-foreground">
                {t("Another event action is in progress.")}
              </Typography>
            ) : null}
            {verifying ? (
              <Typography className="text-foreground">
                {t("Checking whether the previous deletion was saved. Do not submit it again.")}
              </Typography>
            ) : null}
          </ScrollView>
        </HelpPopover>
      ) : (
        <Button
          hitSlop={4}
          {...headerButtonProps}
          variant="danger-soft"
          accessibilityLabel={label}
          accessibilityHint={
            table && event.tableCount <= 1
              ? t("An event must keep at least one table. Delete the event instead.")
              : undefined
          }
          onPress={() => setConfirm(event.version)}
        >
          <Trash2 size={HEADER_ICON_SIZE} color={danger} accessible={false} />
        </Button>
      )}
      {confirm ? (
        <ConfirmDialog
          title={table ? t("Delete table?") : t("Delete event?")}
          description={
            table
              ? t("Delete this table and cancel its active registrations?")
              : t("Permanently delete this event, all its tables, registrations and votes?")
          }
          busy={blocked}
          onCancel={() => setConfirm(null)}
          actions={[
            {
              label,
              variant: "danger",
              icon: <Trash2 size={16} color={foreground} accessible={false} />,
              onPress: remove,
            },
          ]}
        />
      ) : null}
    </View>
  );
}
