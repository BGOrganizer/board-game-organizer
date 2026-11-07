import { communityAccessDenied, useEventResultsForm } from "@board-game-organizer/shared";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useCallback } from "react";
import { BackHandler, View } from "react-native";
import { HeaderBackButton, headerBackOptions } from "@/components/common/layout/HeaderBackButton";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { TableScoreEditor } from "./TableScoreEditor";
export function EventResults({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    f = useEventResultsForm(o, eventId, tableId);
  const denied = communityAccessDenied(f.event.error) || communityAccessDenied(f.table.error),
    busy = f.actions.busy || f.checking;
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener("hardwareBackPress", () => f.actions.busy);
      return () => listener.remove();
    }, [f.actions.busy]),
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t("Register result"),
          ...headerBackOptions(() => router.back()),
          headerLeft: () => (
            <HeaderBackButton
              label={t("Back")}
              disabled={f.actions.busy}
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <View style={{ gap: 12, padding: 20 }}>
        {!denied && f.table.data ? (
          <Typography accessibilityRole="header" className="font-semibold text-foreground">
            {f.table.data.name}
          </Typography>
        ) : null}
        {f.event.isError || f.table.isError ? (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load table")}
            </Typography>
            <Button
              onPress={() => {
                void f.event.refetch();
                void f.table.refetch();
              }}
            >
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        ) : null}
        {f.event.data &&
        f.table.data &&
        !f.event.isError &&
        !f.table.isError &&
        !f.allowed &&
        !denied ? (
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Only an authorized organizer can record results for an included confirmed table.")}
          </Typography>
        ) : null}
        {f.allowed ? (
          <Typography className="text-muted">
            {t(
              "Saved scores remain editable. Ratings and statistics update only when the event is finalized.",
            )}
          </Typography>
        ) : null}
        {f.checking ? (
          <Typography accessibilityLiveRegion="polite" className="text-foreground">
            {t("Checking saved changes")}
          </Typography>
        ) : null}
        {f.conflict ? (
          <Typography accessibilityRole="alert" className="text-danger">
            {t("This event changed. Go back and reopen the editor before saving.")}
          </Typography>
        ) : null}
        {f.error ? (
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not save table result")}
          </Typography>
        ) : null}
        {!f.playersReady && f.loading ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : null}
        {f.allowed && (f.seats.isError || f.playersIncomplete) ? (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load players")}
            </Typography>
            <Button onPress={() => void f.seats.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        ) : null}
        {f.allowed && f.seats.hasNextPage ? (
          <Button
            isDisabled={f.seats.isFetchingNextPage}
            onPress={() => void f.seats.fetchNextPage()}
          >
            <Button.Label>{t("Load more players")}</Button.Label>
          </Button>
        ) : null}
      </View>
      {f.playersReady && !denied ? (
        <TableScoreEditor
          key={tableId}
          players={f.players}
          initial={f.initial}
          busy={busy || f.conflict}
          onSubmit={(input) =>
            f.save(input, () =>
              router.dismissTo({ pathname: "/event/table", params: { eventId, tableId } }),
            )
          }
        />
      ) : null}
    </View>
  );
}
