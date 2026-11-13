"use client";
import type { NotificationChangeRow } from "@board-game-organizer/schemas";
import type { useNotificationChanges } from "@board-game-organizer/shared";
import { Button, ListBox, Skeleton } from "@heroui/react";
import { Collection, ListBoxLoadMoreItem, ListLayout, Virtualizer } from "@heroui/react/rac";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Bell, CheckCheck, RotateCcw } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
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

/** The body grows naturally; the overlay's actual placement determines its scroll limit. */
export function NotificationChangesPopover({ model }: { model: Model }) {
  const { t, i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(320);
  useLayoutEffect(() => {
    if (!open || !body.current) return;
    const overlay = body.current.closest<HTMLElement>(".popover");
    if (!overlay) return;
    const measure = () => {
      const measured = Number.parseFloat(getComputedStyle(overlay).maxHeight);
      const available = measured > 0 ? measured : window.innerHeight - 24;
      setBodyHeight(
        Math.max(0, available - 24 - (heading.current?.getBoundingClientRect().height || 44) - 8),
      );
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(overlay);
    if (heading.current) resize.observe(heading.current);
    const position = new MutationObserver(measure);
    position.observe(overlay, { attributes: true, attributeFilter: ["style"] });
    window.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      position.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open]);
  const canRead = model.changes.some((row) => !row.requiresResponse) || model.hasNextPage;
  const unread =
    model.changes.length > 0 || Object.values(model.tabCounts).some((count) => count > 0);
  const label = (row: NotificationChangeRow) => {
    const message =
      row.messageCode === "invitation" && !row.requiresResponse
        ? t`Invitation updated`
        : i18n._(messages[row.messageCode] ?? messages.information);
    return row.currentLabel ? `${message}: ${row.currentLabel}` : message;
  };
  const more = () => {
    if (
      open &&
      model.hasNextPage &&
      !model.isFetchingNextPage &&
      !model.isFetchNextPageError &&
      !model.isError
    )
      void model.fetchNextPage();
  };
  return (
    <HelpPopover
      label={t`New changes`}
      icon={Bell}
      tone="warning"
      size="compact"
      triggerClassName="bg-default"
      className="max-w-[calc(100vw-24px)]"
      onOpenChange={(value) => {
        setOpen(value);
        model.resetWindow();
      }}
      indicator={
        unread ? (
          <span className="pointer-events-none absolute right-0 top-0">
            <NotificationUnreadDot active />
          </span>
        ) : undefined
      }
    >
      <div
        ref={body}
        className="flex flex-col gap-2"
        style={{
          width: "min(320px, calc(100vw - 48px))",
          minHeight: Math.min(72, bodyHeight + 52),
        }}
      >
        <div ref={heading} className="flex min-h-11 items-center gap-2">
          <h2 className="min-w-0 flex-1 text-base font-semibold text-foreground">{t`New changes`}</h2>
          <Button
            isIconOnly
            size="sm"
            variant="danger-soft"
            className="min-h-11 min-w-11 shrink-0"
            aria-label={t`Mark all changes as read`}
            data-testid="notification-changes-read"
            isDisabled={!canRead || model.isReading || model.isPending}
            onPress={() => {
              if (canRead && !model.isReading && !model.isPending) void model.markAllAsRead();
            }}
          >
            <CheckCheck className="size-5" aria-hidden />
          </Button>
        </div>
        {open ? (
          <div className="flex min-h-0 flex-col gap-2" style={{ maxHeight: bodyHeight }}>
            <Virtualizer layout={ListLayout} shouldObserveItemSize>
              <ListBox
                aria-label={t`Changes`}
                selectionMode="none"
                data-testid="notification-changes-list"
                className="min-h-0 w-full shrink overflow-y-auto"
                style={{ maxHeight: bodyHeight }}
                onScroll={({ currentTarget }) => {
                  if (
                    currentTarget.scrollHeight -
                      currentTarget.scrollTop -
                      currentTarget.clientHeight <
                    120
                  )
                    more();
                }}
              >
                <Collection
                  items={model.changes.map((row) => ({
                    ...row,
                    id: `${row.notificationId}:${row.itemId ?? "generic"}`,
                  }))}
                >
                  {(row) => (
                    <ListBox.Item
                      id={row.id}
                      textValue={label(row)}
                      className="whitespace-normal px-0 py-1.5 text-sm text-foreground [overflow-wrap:anywhere]"
                    >
                      {label(row)}
                    </ListBox.Item>
                  )}
                </Collection>
                {!model.changes.length ? (
                  <ListBox.Item
                    id="empty"
                    textValue={
                      model.isPending
                        ? t`Loading…`
                        : model.isError
                          ? t`Could not load changes. Try again.`
                          : t`No new changes`
                    }
                  >
                    {model.isPending ? (
                      <Skeleton className="h-12 w-full rounded" />
                    ) : !model.isError ? (
                      <span className="text-muted">{t`No new changes`}</span>
                    ) : null}
                  </ListBox.Item>
                ) : null}
                {model.changes.some((row) => row.requiresResponse) ? (
                  <ListBox.Item
                    id="invitations-note"
                    textValue={t`Invitations remain unread until you respond.`}
                    className="whitespace-normal text-sm text-muted"
                  >{t`Invitations remain unread until you respond.`}</ListBox.Item>
                ) : null}
                {model.hasNextPage && !model.isError ? (
                  <ListBoxLoadMoreItem onLoadMore={more} isLoading={model.isFetchingNextPage}>
                    {model.isFetchingNextPage ? <Skeleton className="h-8 w-full rounded" /> : null}
                  </ListBoxLoadMoreItem>
                ) : null}
              </ListBox>
            </Virtualizer>
            {model.isError || model.readError ? (
              <div role="alert" className="space-y-1">
                <p className="text-danger">
                  {model.readError
                    ? t`Could not mark changes as read. Try again.`
                    : t`Could not load changes. Try again.`}
                </p>
                <Button
                  isIconOnly
                  size="sm"
                  variant="secondary"
                  className="min-h-11 min-w-11"
                  aria-label={t`Try again`}
                  isDisabled={model.isReading}
                  onPress={() => {
                    void (model.readError
                      ? model.markAllAsRead()
                      : model.isFetchNextPageError
                        ? model.fetchNextPage()
                        : model.refetch());
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </HelpPopover>
  );
}
