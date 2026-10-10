import type { EventResponse, EventTableResponse } from "@board-game-organizer/schemas";
import {
  type EventDraftTable,
  editableEventTable,
  eventTableChanged,
  eventTableEditInput,
  useEventActions,
  useEventTableContext,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { ArrowLeft } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableEditor } from "./EventTableEditor";

export function EventTableEdit({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT();
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const context = useEventTableContext(useCommunityApi(), eventId, tableId);
  const { event, table } = context;
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/event/table", params: { eventId, tableId } });
  };
  if (
    event &&
    table &&
    event.role === "admin" &&
    event.canModify &&
    context.open &&
    table.status === "PLANNING"
  )
    return <TableForm key={`${eventId}/${tableId}`} event={event} table={table} onBack={back} />;
  return (
    <View style={{ flex: 1, padding: 20, gap: 12 }}>
      <Stack.Screen
        options={{
          title: t("Edit table"),
          headerBackVisible: false,
          headerLeft: () => (
            <Button
              isIconOnly
              variant="ghost"
              style={{ minHeight: 44, minWidth: 44 }}
              accessibilityLabel={t("Back")}
              onPress={back}
            >
              <ArrowLeft size={24} color={foreground} />
            </Button>
          ),
        }}
      />
      {context.eventQuery.isPending || (event && context.tableQuery.isPending) ? (
        <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
      ) : (
        <>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Event cannot be edited")}
          </Typography>
          <Button
            onPress={() => {
              void context.eventQuery.refetch();
              if (event) void context.tableQuery.refetch();
            }}
          >
            {t("Retry")}
          </Button>
        </>
      )}
    </View>
  );
}

function TableForm({
  event,
  table,
  onBack,
}: {
  event: EventResponse;
  table: EventTableResponse;
  onBack: () => void;
}) {
  const t = useT();
  const actions = useEventActions(useCommunityApi());
  const [version] = useState(event.version);
  const [pending, setPending] = useState<EventDraftTable | null>(null);
  const [failed, setFailed] = useState(false);
  const back = () => {
    if (!actions.busy) onBack();
  };
  const save = async (draft: EventDraftTable) => {
    if (actions.busy) return;
    try {
      await actions.update.mutateAsync({
        id: event.id,
        input: eventTableEditInput({ ...event, version }, draft.input),
      });
      setPending(null);
      onBack();
    } catch {
      setFailed(true);
    }
  };
  return (
    <View style={{ flex: 1 }}>
      {failed ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {t("Could not save event. Check your connection and event permissions, then try again.")}
        </Typography>
      ) : null}
      <EventTableEditor
        draft={{
          key: table.id,
          input: editableEventTable(table),
          gameName: table.gameName,
          imageUrl: table.image,
          demonstrator: table.demonstrator ?? undefined,
        }}
        timeZone={event.timeZone}
        eventStart={event.startsAt}
        eventEnd={event.endsAt}
        organizationId={event.organizationId}
        busy={actions.busy}
        onClose={back}
        onSave={(draft) => {
          if (actions.busy) return;
          if (!eventTableChanged(table, draft.input)) back();
          else setPending(draft);
        }}
      />
      {pending ? (
        <CommunityConfirm
          title={t("Reset reservations")}
          description={t(
            "Affected bookings and invitations will be cancelled. Players must request or accept a place again.",
          )}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setPending(null);
          }}
          actions={[
            {
              label: t("Save changes"),
              variant: "danger",
              onPress: () => {
                void save(pending);
              },
            },
          ]}
        />
      ) : null}
    </View>
  );
}
