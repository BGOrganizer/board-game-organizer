import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useEventCutoff, useEventRecordActions } from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, Dices, X } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventTableCard({ table }: { table: PlannedTableResponse }) {
  const t = useT(),
    o = useCommunityApi(),
    a = useEventRecordActions(o, table.eventId),
    router = useRouter(),
    fg = useThemeColor("foreground"),
    accent = useThemeColor("accent-foreground"),
    registration = table.myRegistration,
    closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  return (
    <LinkedListCard
      label={`${t("Open table")}: ${table.name}`}
      onPress={() =>
        router.push({
          pathname: "/event/table",
          params: { eventId: table.eventId, tableId: table.id },
        })
      }
      actions={
        table.canRespond && !closed && registration ? (
          <>
            <Button
              isIconOnly
              size="sm"
              style={{ minWidth: 44, minHeight: 44 }}
              accessibilityLabel={t("Accept invitation")}
              isDisabled={a.busy}
              onPress={() =>
                a.respond.mutate({
                  registrationId: registration.id,
                  input: { action: "accept", version: registration.version },
                })
              }
            >
              <Check size={18} color={accent} />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              style={{ minWidth: 44, minHeight: 44 }}
              accessibilityLabel={t("Decline invitation")}
              isDisabled={a.busy}
              onPress={() =>
                a.respond.mutate({
                  registrationId: registration.id,
                  input: { action: "decline", version: registration.version },
                })
              }
            >
              <X size={18} color={fg} />
            </Button>
          </>
        ) : undefined
      }
    >
      <AnimatedDicebearArtwork seed={table.id} variant="shapes" />
      <ListCardBody title={table.name} titleIcon={<Dices size={18} color={fg} />}>
        <Typography className="text-sm text-muted">
          {table.eventName} ·{" "}
          {table.eventStatus === "PLANNING"
            ? t("Planning")
            : table.eventStatus === "CONFIRMED"
              ? table.confirmed
                ? t("Confirmed")
                : t("Excluded from confirmation")
              : t("Terminated")}
        </Typography>
        <Typography className="text-foreground">
          {t("Players")}: {table.seatedCount}/{table.maxPlayers} · {t("Waiting")}:{" "}
          {table.waitingCount} · {t("Pending")}: {table.pendingCount}
        </Typography>
        <Typography className="text-foreground">
          {table.gamesDetail
            .filter((game) => !table.confirmed || game.id === table.confirmed.gameId)
            .map((game) => game.name)
            .join(", ")}
        </Typography>
        {table.winners?.length ? (
          <Typography className="text-foreground">
            {t("Winners")}: {table.winners.map((row) => row.name).join(", ")}
          </Typography>
        ) : null}
        {table.myPosition ? (
          <Typography className="text-foreground">
            {table.myPosition === "WAITING"
              ? t("Waiting list")
              : table.myPosition === "FROZEN"
                ? t("Confirmed player")
                : t("Reserved place")}
          </Typography>
        ) : null}
        {table.canRespond && !closed ? (
          <View style={{ paddingBottom: 44 }}>
            <Typography className="text-foreground">{t("Invitation received")}</Typography>
          </View>
        ) : null}
      </ListCardBody>
    </LinkedListCard>
  );
}
