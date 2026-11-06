import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  clientMutationPhase,
  type EventProposalCategory,
  eventProposalAuthors,
  eventProposalLabel,
  useEventProposalSection,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, X } from "lucide-react-native";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventProposalItem } from "./EventProposalItem";
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
    [primary, danger] = useThemeColor(["accent-foreground", "danger"]);
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
          return (
            <EventProposalItem
              key={row.id}
              row={row}
              authorNames={s.manager ? eventProposalAuthors(row) : undefined}
              actions={
                s.manager && event.status === "PLANNING" && row.status === "PENDING" ? (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Button
                      isIconOnly
                      size="sm"
                      style={{ minWidth: 44, minHeight: 44 }}
                      accessibilityLabel={`${t("Accept proposal")}: ${eventProposalAuthors(row)} — ${label}`}
                      isDisabled={
                        disabled ||
                        !s.q.hasVerifiedBase ||
                        s.actions.busy ||
                        Boolean(row.clientAction)
                      }
                      onPress={() => s.open(row, "accept")}
                    >
                      <Check size={20} color={primary} />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      style={{ minWidth: 44, minHeight: 44 }}
                      accessibilityLabel={`${t("Reject proposal")}: ${eventProposalAuthors(row)} — ${label}`}
                      isDisabled={
                        disabled ||
                        !s.q.hasVerifiedBase ||
                        s.actions.busy ||
                        Boolean(row.clientAction)
                      }
                      onPress={() => s.open(row, "reject")}
                    >
                      <X size={20} color={danger} />
                    </Button>
                  </View>
                ) : null
              }
            >
              {s.manager && row.payload.kind !== "game" ? (
                <Typography className="text-sm text-muted">{row.authorName}</Typography>
              ) : null}
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
        <ConfirmDialog
          title={s.decision.action === "accept" ? t("Accept proposal") : t("Reject proposal")}
          description={
            s.validDecision
              ? `${eventProposalAuthors(s.decision.row)}: ${eventProposalLabel(s.decision.row.payload, s.decision.row.label, i18n.locale)}`
              : t(
                  "This proposal changed or the action is unavailable. Close and review current proposals.",
                )
          }
          onCancel={s.cancel}
          actions={
            s.validDecision
              ? [
                  {
                    label:
                      s.decision.action === "accept" ? t("Accept proposal") : t("Reject proposal"),
                    variant: s.decision.action === "accept" ? "primary" : "danger",
                    onPress: s.confirm,
                  },
                ]
              : []
          }
        />
      ) : null}
    </View>
  );
}
