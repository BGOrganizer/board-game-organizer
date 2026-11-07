import { useEventProposalEditor } from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { MessageSquarePlus } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { headerBackOptions } from "@/components/common/layout/HeaderBackButton";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import GamePicker from "@/components/games/GamePicker";
import LocationPicker from "@/components/locations/LocationPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDateTimeField } from "./EventDateTimeField";

export function EventProposalEditor({
  eventId,
  kind,
  tableId,
  draftId,
}: {
  eventId: string;
  kind: string;
  tableId?: string;
  draftId?: string;
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter();
  const form = useEventProposalEditor(o, eventId, kind, tableId, draftId);
  const identity = JSON.stringify([o.apiUrl, o.userId, eventId, kind, tableId, draftId]);
  const [closing, setClosing] = useState<string | null>(null);
  const closed = useRef(false);
  const close = () => setClosing(identity);
  // Unmount picker/removal guards before dispatching native Back, never recursively pop a guarded picker.
  useEffect(() => {
    if (closing !== identity || closed.current) return;
    closed.current = true;
    if (router.canGoBack()) router.back();
    else if (kind === "game" && tableId)
      router.replace({ pathname: "/event/table", params: { eventId, tableId } });
    else router.replace({ pathname: "/event/[eventId]", params: { eventId } });
  }, [closing, identity, router, eventId, kind, tableId]);
  const title =
    kind === "game"
      ? t("Choose a game")
      : kind === "location"
        ? t("Choose a location")
        : t("Choose date and time");
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title,
          gestureEnabled: true,
          headerTitle: ({ children }) => <HeaderTitle title={children} icon={MessageSquarePlus} />,
          headerRight: () => null,
          ...headerBackOptions(close),
        }}
      />
      {closing === identity ? null : form.allowed && kind === "game" ? (
        <GamePicker
          onClose={close}
          proposalScope={{ eventId, tableId: tableId ?? "" }}
          excludeIds={form.table.data?.games.map((game) => game.gameId)}
          onSelect={(game) => {
            if (form.submit({ kind: "game", tableId: tableId ?? "", gameId: game.id }, game.name))
              close();
          }}
        />
      ) : form.allowed && kind === "location" ? (
        <LocationPicker
          onClose={close}
          initial={form.payload?.kind === "location" ? form.payload.location : undefined}
          onSelect={(location) => {
            if (form.submit({ kind: "location", location }, location.name)) close();
          }}
        />
      ) : (
        <View style={{ padding: 20, gap: 16 }}>
          {form.validInput && (form.q.isPending || (kind === "game" && form.table.isPending)) ? (
            <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
          ) : !form.allowed ? (
            <>
              <Typography accessibilityRole="alert" className="text-danger">
                {t(
                  "Proposals require an enabled category and your own seated participation in a private planning event.",
                )}
              </Typography>
              {form.q.isError || form.table.isError ? (
                <Button
                  onPress={() => {
                    void form.q.refetch();
                    if (kind === "game") void form.table.refetch();
                  }}
                >
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              ) : null}
            </>
          ) : (
            <EventDateTimeField
              label={t("Choose date and time")}
              mode="datetime"
              timeZone={form.event?.timeZone ?? "UTC"}
              value={
                form.payload?.kind === "date" ? `${form.payload.day}T${form.payload.startTime}` : ""
              }
              onChange={(wall) => {
                if (
                  form.submit(
                    { kind: "date", day: wall.slice(0, 10), startTime: wall.slice(11, 16) },
                    wall.replace("T", " "),
                  )
                )
                  close();
              }}
            />
          )}
          <Button variant="ghost" onPress={close}>
            <Button.Label>{t("Cancel")}</Button.Label>
          </Button>
        </View>
      )}
    </View>
  );
}
