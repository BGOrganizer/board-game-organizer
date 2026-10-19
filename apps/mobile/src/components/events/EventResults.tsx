import { communityAccessDenied, useEventResultsForm } from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { TableScoreEditor } from "./TableScoreEditor";
export function EventResults({ eventId }: { eventId: string }) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    f = useEventResultsForm(o, eventId),
    event = communityAccessDenied(f.event.error) ? undefined : f.event.data;
  const finish = async () => {
    if (await f.finalize()) router.dismissTo({ pathname: "/event/[eventId]", params: { eventId } });
  };
  if (!event)
    return (
      <View style={{ padding: 20 }}>
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
      <TableScoreEditor
        key={f.selected}
        players={f.players}
        initial={f.scores[f.selected]}
        busy={f.actions.busy}
        onBack={f.close}
        onSubmit={f.save}
      />
    ) : (
      <View style={{ padding: 20, gap: 12 }}>
        <Button variant="ghost" onPress={f.close}>
          <Button.Label>{t("Back")}</Button.Label>
        </Button>
        {f.seats.isPending ? (
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
      <Stack.Screen options={{ title: t("Register event results") }} />
      <FlatList
        data={f.included}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Typography className="text-foreground">
              {t(
                "Enter every frozen player once for every included table. Finalization is atomic and irreversible. All-ND tables do not change ratings or statistics.",
              )}
            </Typography>
            {f.conflict ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("This event changed. Go back and reopen the editor before saving.")}
              </Typography>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ gap: 8 }}>
            <Typography className="text-foreground">
              {item.name} · {f.scores[item.id] ? t("Scores ready") : t("Scores required")}
            </Typography>
            <Button variant="outline" isDisabled={f.actions.busy} onPress={() => f.open(item.id)}>
              <Button.Label>{t("Edit scores")}</Button.Label>
            </Button>
          </View>
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
            { label: t("Finalize event"), variant: "primary", onPress: () => void finish() },
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
