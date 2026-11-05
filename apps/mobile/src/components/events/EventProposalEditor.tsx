import { eventProposalLabel, useEventProposalEditor } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { MessageSquarePlus } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import { HeaderBackButton, headerBackOptions } from "@/components/common/layout/HeaderBackButton";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
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
  const { i18n } = useLingui();
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    form = useEventProposalEditor(o, eventId, kind, tableId, draftId);
  const identity = `${o.apiUrl}|${o.userId}|${eventId}|${kind}|${tableId ?? ""}|${draftId ?? ""}`;
  const [pickerOwner, setPickerOwner] = useState<string | null>(null);
  const pick = pickerOwner === identity && form.allowed;
  useEffect(() => {
    if (!form.allowed) setPickerOwner(null);
  }, [form.allowed]);
  const setPick = useCallback(
    (open: boolean) => setPickerOwner(open ? identity : null),
    [identity],
  );
  const close = () => {
    if (router.canGoBack()) router.back();
    else if (kind === "game" && tableId)
      router.replace({ pathname: "/event/table", params: { eventId, tableId } });
    else router.replace({ pathname: "/event/[eventId]", params: { eventId } });
  };
  useEffect(() => {
    if (!pick) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setPick(false);
      return true;
    });
    return () => listener.remove();
  }, [pick, setPick]);
  const title =
    kind === "date"
      ? t("Propose a date and time")
      : kind === "location"
        ? t("Propose a location")
        : t("Propose a game");
  if (pick && form.allowed)
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen
          options={{
            title: t("Choose"),
            gestureEnabled: false,
            headerLeft: () => <HeaderBackButton onPress={() => setPick(false)} />,
            headerRight: () => null,
          }}
        />
        {kind === "game" ? (
          <GamePicker
            excludeIds={form.table.data?.games.map((g) => g.gameId)}
            onClose={() => setPick(false)}
            onSelect={(game) => {
              form.chooseGame(game);
              setPick(false);
            }}
          />
        ) : (
          <LocationPicker
            onClose={() => setPick(false)}
            onSelect={(location) => {
              form.chooseLocation(location);
              setPick(false);
            }}
          />
        )}
      </View>
    );
  return (
    <ScreenScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Stack.Screen
        options={{
          title,
          gestureEnabled: true,
          headerTitle: ({ children }) => <HeaderTitle title={children} icon={MessageSquarePlus} />,
          headerRight: () => null,
          ...headerBackOptions(close),
        }}
      />
      {form.validInput && form.q.isPending ? (
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
        <>
          <Typography className="text-foreground">
            {t("Submit explicitly. Your proposal stays private until managers approve its option.")}
          </Typography>
          {kind === "date" ? (
            <EventDateTimeField
              label={t("Choose date and time")}
              mode="datetime"
              timeZone={form.event?.timeZone ?? "UTC"}
              value={
                form.payload?.kind === "date" ? `${form.payload.day}T${form.payload.startTime}` : ""
              }
              onChange={form.chooseDate}
            />
          ) : (
            <Button variant="outline" onPress={() => setPick(true)}>
              <Button.Label>
                {kind === "game" ? t("Choose a game") : t("Choose a verified address")}
              </Button.Label>
            </Button>
          )}
          {form.label ? (
            <Typography className="text-foreground" accessibilityLiveRegion="polite">
              {form.payload
                ? eventProposalLabel(form.payload, form.label, i18n.locale)
                : form.label}
            </Typography>
          ) : null}
          <Button
            isDisabled={!form.canSubmit}
            onPress={() => {
              if (form.submit()) close();
            }}
          >
            <Button.Label>{t("Send proposal")}</Button.Label>
          </Button>
        </>
      )}
      <Button variant="ghost" onPress={close}>
        <Button.Label>{t("Cancel")}</Button.Label>
      </Button>
    </ScreenScrollView>
  );
}
