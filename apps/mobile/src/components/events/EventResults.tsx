import { communityAccessDenied, useEventResultsForm } from "@board-game-organizer/shared";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { ArrowLeft, Flag } from "lucide-react-native";
import { useCallback } from "react";
import { BackHandler, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventResultTableCard } from "./EventResultTableCard";
import { TableScoreEditor } from "./TableScoreEditor";
export function EventResults({ eventId }: { eventId: string }) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    f = useEventResultsForm(o, eventId),
    event = communityAccessDenied(f.event.error) ? undefined : f.event.data;
  const [accentForeground, foreground] = useThemeColor(["accent-foreground", "foreground"]);
  useFocusEffect(
    useCallback(() => {
      if (!f.selected) return;
      const listener = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!f.actions.busy) f.close();
        return true;
      });
      return () => listener.remove();
    }, [f.selected, f.actions.busy, f.close]),
  );
  const screenHeader = (
    <Stack.Screen
      options={{
        title: f.selected ? t("Register Table Result") : t("Register Tables Results"),
        headerBackVisible: !f.selected,
        headerLeft: f.selected
          ? () => (
              <Button
                isIconOnly
                variant="ghost"
                accessibilityLabel={t("Back to tables")}
                isDisabled={f.actions.busy}
                onPress={f.close}
                style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
                hitSlop={4}
              >
                <ArrowLeft size={20} color={foreground} accessible={false} />
              </Button>
            )
          : undefined,
      }}
    />
  );
  const tableError = f.table.isError ? (
    <View style={{ gap: 8 }}>
      <Typography accessibilityRole="alert" className="text-danger">
        {t("Could not load table")}
      </Typography>
      <Button onPress={() => void f.table.refetch()}>
        <Button.Label>{t("Try again")}</Button.Label>
      </Button>
    </View>
  ) : null;
  const finish = () => {
    if (f.finalize()) router.dismissTo({ pathname: "/event/[eventId]", params: { eventId } });
  };
  if (!event)
    return (
      <View style={{ padding: 20 }}>
        {screenHeader}
        {f.event.isPending ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load event")}
            </Typography>
            <Button onPress={() => void f.event.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        )}
      </View>
    );
  if (!event.canFinalize && !f.actions.busy)
    return (
      <Typography accessibilityRole="alert" className="text-danger">
        {t("Only an authorized organizer can finalize a confirmed event.")}
      </Typography>
    );
  if (f.selected)
    return f.playersReady ? (
      <>
        {screenHeader}
        {tableError}
        <TableScoreEditor
          key={f.selected}
          players={f.players}
          initial={f.scores[f.selected]}
          busy={f.actions.busy}
          onSubmit={f.save}
        />
      </>
    ) : (
      <View style={{ padding: 20, gap: 12 }}>
        {screenHeader}
        {tableError}
        {f.table.isPending || f.seats.isPending ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : null}
        {f.seats.isError ? (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load players")}
            </Typography>
            <Button onPress={() => void f.seats.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        ) : null}
        {f.seats.hasNextPage ? (
          <Button
            isDisabled={f.seats.isFetchingNextPage}
            onPress={() => void f.seats.fetchNextPage()}
          >
            <Button.Label>{t("Load more players")}</Button.Label>
          </Button>
        ) : null}
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      {screenHeader}
      <FlatList
        data={f.included}
        keyExtractor={(row) => row.id}
        onEndReached={() => {
          if (
            f.tables.hasNextPage &&
            !f.tables.isFetchingNextPage &&
            !f.tables.isFetchNextPageError
          )
            void f.tables.fetchNextPage({ cancelRefetch: false });
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <SearchHelpLabel
              label={t("Tables list")}
              helpTitle={t("Field help")}
              help={t(
                "Record results for every table to finalize the event. Finalization is irreversible. All-ND tables do not change ratings or statistics.",
              )}
            />
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
          </View>
        }
        renderItem={({ item }) => (
          <EventResultTableCard
            table={item}
            ready={f.isScoreCurrent(item.id)}
            busy={f.actions.busy}
            onPress={() => f.open(item.id)}
          />
        )}
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {f.tables.isPending ? (
              <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
            ) : null}
            {f.tables.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load tables")}
                </Typography>
                <Button onPress={() => void f.tables.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </>
            ) : null}
            {f.tables.hasNextPage ? (
              <Button
                isDisabled={f.tables.isFetchingNextPage}
                onPress={() => void f.tables.fetchNextPage()}
              >
                <Button.Label>{t("Load more tables")}</Button.Label>
              </Button>
            ) : null}
          </View>
        }
      />
      <View style={{ padding: 20, paddingBottom: insets.bottom + 16 }}>
        <Button isDisabled={!f.ready || f.actions.busy} onPress={() => f.setConfirm(true)}>
          <Flag size={18} color={accentForeground} accessible={false} />
          <Button.Label>{t("Finalize event")}</Button.Label>
        </Button>
      </View>
      {f.confirm ? (
        <ConfirmDialog
          title={t("Finalize event?")}
          description={t("Results and ratings for all included tables become immutable together.")}
          busy={f.actions.busy}
          onCancel={() => f.setConfirm(false)}
          actions={[
            {
              label: t("Finalize event"),
              variant: "primary",
              icon: <Flag size={16} color={accentForeground} accessible={false} />,
              onPress: () => void finish(),
            },
          ]}
        >
          {f.error ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not verify event finalization. Refresh the event before retrying.")}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </View>
  );
}
