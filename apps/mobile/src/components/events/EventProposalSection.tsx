import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  clientMutationPhase,
  type EventProposalCategory,
  eventProposalLabel,
  useEventProposalSection,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CircleCheck, CircleX, ClipboardCheck } from "lucide-react-native";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventProposalItem } from "./EventProposalItem";
import { EventProposalReviewDialog } from "./EventProposalReviewDialog";
export function EventProposalSection({
  event,
  kind,
  table,
  disabled = false,
}: {
  event: PlannedEventResponse;
  kind: EventProposalCategory;
  table?: PlannedTableResponse;
  disabled?: boolean;
}) {
  const { i18n } = useLingui();
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    s = useEventProposalSection(o, event, kind, table, disabled),
    accentForeground = useThemeColor("accent-foreground");
  const openEditor = (draftId?: string) =>
    router.push({
      pathname: "/event/proposal",
      params: {
        eventId: event.id,
        kind,
        ...(table ? { tableId: table.id } : {}),
        ...(draftId ? { draftId } : {}),
      },
    });
  if (!s.visible) return null;
  return (
    <View style={{ gap: 10 }}>
      <Typography accessibilityRole="header" className="font-semibold text-foreground">
        {kind === "date"
          ? t("Proposed dates/times")
          : kind === "location"
            ? t("Proposed locations")
            : t("Proposed games")}
      </Typography>
      {s.canPropose ? (
        <GroupedList>
          {kind === "date" ? (
            <EventDateTimeField
              key={`${o.apiUrl}:${o.userId}:${event.id}:${event.version}`}
              label={t("Choose date and time")}
              mode="datetime"
              timeZone={event.timeZone}
              value=""
              rowOnly
              onChange={s.submitDate}
            />
          ) : kind === "location" ? (
            <LocationListRow name={t("Choose a location")} onPress={() => openEditor()} />
          ) : (
            <GameListRow name={t("Choose a game")} onPress={() => openEditor()} />
          )}
        </GroupedList>
      ) : null}
      {s.intents.map((intent) => {
        const phase =
          intent.status === "error" && !intent.context?.operation?.uncertain
            ? "failed"
            : clientMutationPhase(
                intent.status,
                intent.error,
                intent.context?.operation?.uncertain,
              );
        return (
          <View key={intent.draftId} style={{ gap: 6 }}>
            <Typography className="text-foreground">
              {eventProposalLabel(
                intent.variables.payload,
                intent.variables.clientLabel,
                i18n.locale,
              )}
            </Typography>
            <Typography
              accessibilityLiveRegion="polite"
              className={phase === "failed" ? "text-danger" : "text-muted"}
            >
              {phase === "failed"
                ? t("Could not send proposal")
                : phase === "verifying"
                  ? t("Checking saved changes")
                  : t("Sending proposal")}
            </Typography>
            {phase === "failed" ? (
              <Button
                size="sm"
                style={{ minHeight: 44, minWidth: 44 }}
                variant="outline"
                onPress={() => openEditor(intent.draftId)}
              >
                <Button.Label>{t("Review unsent proposal")}</Button.Label>
              </Button>
            ) : null}
          </View>
        );
      })}
      {s.q.isPending ? <Skeleton style={{ width: "100%", height: 100, borderRadius: 12 }} /> : null}
      {s.q.isError ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load proposals")}
          </Typography>
          <Button
            size="sm"
            style={{ minHeight: 44, minWidth: 44 }}
            onPress={() => void s.q.refetch()}
          >
            <Button.Label>{t("Try again")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {!s.q.isPending && !s.q.isError && !s.q.items.length ? (
        <Typography accessibilityLiveRegion="polite" className="text-muted">
          {t("No proposals")}
        </Typography>
      ) : null}
      {/* Five source rows per page; never nest a virtualized feed inside the parent list. */}
      <GroupedList>
        {s.q.items.map((row) => {
          const label = eventProposalLabel(row.payload, row.label, i18n.locale);
          const ReviewIcon =
            row.status === "PENDING"
              ? ClipboardCheck
              : row.status === "ACCEPTED"
                ? CircleCheck
                : CircleX;
          return (
            <EventProposalItem
              key={row.id}
              row={row}
              actions={
                s.manager ? (
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      className="rounded-full"
                      style={{ width: 36, height: 36, minWidth: 36, minHeight: 36, padding: 0 }}
                      hitSlop={4}
                      accessibilityLabel={`${row.status === "PENDING" ? t("Review proposal") : t("Proposal details")}: ${label}`}
                      isDisabled={
                        disabled ||
                        !s.q.hasVerifiedBase ||
                        s.actions.busy ||
                        Boolean(row.clientAction)
                      }
                      onPress={() => s.open(row)}
                    >
                      <ReviewIcon size={16} color={accentForeground} accessible={false} />
                    </Button>
                  </View>
                ) : null
              }
            >
              {row.clientAction || row.status !== "PENDING" ? (
                <Typography accessibilityLiveRegion="polite" className="text-sm text-muted">
                  {row.clientAction
                    ? row.clientAction === "accept"
                      ? t("Accepting proposal")
                      : t("Rejecting proposal")
                    : row.status === "ACCEPTED"
                      ? t("Accepted")
                      : t("Rejected")}
                </Typography>
              ) : null}
            </EventProposalItem>
          );
        })}
      </GroupedList>
      {s.q.canPrevious || s.q.data?.nextCursor ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Button
            size="sm"
            variant="ghost"
            style={{ minHeight: 44, minWidth: 44 }}
            isDisabled={!s.q.canPrevious || s.q.isFetching}
            onPress={s.q.previous}
          >
            <Button.Label>{t("Previous")}</Button.Label>
          </Button>
          <Typography className="text-muted">
            {t("Page")} {s.q.page}
          </Typography>
          <Button
            size="sm"
            variant="ghost"
            style={{ minHeight: 44, minWidth: 44 }}
            isDisabled={!s.q.data?.nextCursor || s.q.isFetching}
            onPress={s.q.next}
          >
            <Button.Label>{t("Next")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {s.decision ? (
        <EventProposalReviewDialog
          row={s.decision.row}
          valid={s.validDecision}
          onCancel={s.cancel}
          onDecision={s.confirm}
        />
      ) : null}
    </View>
  );
}
