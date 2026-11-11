"use client";
import type { NotificationChangeRow } from "@board-game-organizer/schemas";
import type { useNotificationChanges } from "@board-game-organizer/shared";
import { Alert, Button, Skeleton } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { BellRing, Check, ChevronDown, RotateCcw } from "lucide-react";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";

type Model = ReturnType<typeof useNotificationChanges>;
const messages = {
  event_agreement_ready: msg`Event planning is ready for confirmation.`,
  event_agreement_blocked: msg`Event planning needs review. Check participant availability and votes.`,
  event_confirmed: msg`The event has been confirmed.`,
  event_replanning: msg`Event planning has reopened. Check dates, locations and votes.`,
  event_terminated: msg`The event has ended. Results are available.`,
  event_cancelled: msg`The event has been cancelled.`,
  date: msg`Date updated`,
  dates: msg`Date options changed`,
  location: msg`Location updated`,
  locations: msg`Location options changed`,
  game: msg`Game updated`,
  games: msg`Games changed`,
  table_settings: msg`Table settings updated`,
  tables: msg`Tables changed`,
  group_info: msg`Group information updated`,
  member_update: msg`Membership updated`,
  participation: msg`Participation updated`,
  event_state: msg`Event updated`,
  invitation: msg`Invitation awaiting a response`,
  proposal: msg`Proposal updated`,
  review: msg`Review updated`,
  information: msg`Information updated`,
};
/** Protected decisions are listed, but the sole read action never resolves or reads them. */
export function NotificationChangesAlert({ model }: { model: Model }) {
  const { t, i18n } = useLingui();
  const canRead = model.changes.some((row) => !row.requiresResponse);
  const label = (row: NotificationChangeRow) => {
    const message =
      row.messageCode === "invitation" && !row.requiresResponse
        ? t`Invitation updated`
        : i18n._(messages[row.messageCode] ?? messages.information);
    return row.currentLabel ? `${message}: ${row.currentLabel}` : message;
  };
  const more = () => {
    if (model.hasNextPage && !model.isFetchingNextPage) void model.fetchNextPage();
  };
  if (!model.changes.length && model.isPending)
    return <Skeleton className="h-24 w-full rounded-xl" />;
  if (!model.changes.length && !model.isError && !model.readError) return null;
  return (
    <Alert
      status="warning"
      aria-label={t`New changes`}
      data-testid="notification-changes-alert"
      className="w-full items-start"
    >
      <Alert.Indicator>
        <BellRing className="size-5" aria-hidden />
      </Alert.Indicator>
      <Alert.Content className="min-w-0 flex-1 space-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Alert.Title className="min-w-0 shrink">{t`New changes`}</Alert.Title>
          <NotificationUnreadDot active={model.changes.length > 0} />
        </div>
        {model.changes.length ? (
          <ul aria-label={t`Changes`} className="min-h-10 w-full min-w-0 [overflow-wrap:anywhere]">
            {model.changes.map((row: NotificationChangeRow) => (
              <li key={`${row.notificationId}:${row.itemId ?? "generic"}`}>
                <Alert.Description className="whitespace-normal text-sm [overflow-wrap:anywhere]">
                  {label(row)}
                </Alert.Description>
              </li>
            ))}
          </ul>
        ) : null}
        {model.changes.some((row) => row.requiresResponse) ? (
          <Alert.Description>{t`Invitations remain unread until you respond.`}</Alert.Description>
        ) : null}
        {model.isError || model.readError ? (
          <div role="alert" className="flex items-center gap-2">
            <p className="text-danger">
              {model.readError
                ? t`Could not mark changes as read. Try again.`
                : t`Could not load changes. Try again.`}
            </p>
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              aria-label={t`Try again`}
              onPress={() =>
                void (model.isFetchNextPageError ? model.fetchNextPage() : model.refetch())
              }
            >
              <RotateCcw className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}
        {model.isFetchingNextPage ? (
          <Skeleton className="h-8 w-full rounded" />
        ) : model.hasNextPage ? (
          <Button size="sm" variant="secondary" onPress={more}>
            <ChevronDown className="size-4" aria-hidden />
            {t`More changes`}
          </Button>
        ) : null}
      </Alert.Content>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={t`Mark displayed changes as read`}
        data-testid="notification-changes-read"
        className="min-h-11 min-w-11 shrink-0 self-start p-0"
        isDisabled={!canRead || model.isReading}
        onPress={() => {
          if (canRead && !model.isReading) model.markDisplayedAsRead();
        }}
      >
        <span className="inline-flex size-7 items-center justify-center text-warning" aria-hidden>
          <Check className="size-4" />
        </span>
      </Button>
    </Alert>
  );
}
