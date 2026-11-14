"use client";
import {
  formatUsername,
  tableUserRoles,
  type useTableSeatOrder,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowDown,
  ArrowUp,
  Check,
  LockKeyhole,
  LockKeyholeOpen,
  RotateCcw,
  UserRoundPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { floatingActionPositionStyle } from "@/components/common/layout/floatingActionStyles";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { WindowedList } from "@/components/common/ui/WindowedList";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { EventSeatListHeading } from "./EventSeatListHeading";
export function EventSeatOrderEditor({
  model,
  header,
  demonstratorUserId,
}: {
  model: ReturnType<typeof useTableSeatOrder>;
  header?: ReactNode;
  demonstratorUserId?: string | null;
}) {
  const { t, i18n } = useLingui();
  return (
    <section className="space-y-3" aria-label={t`Reorder seats`} data-testid="seat-order-list">
      {header}
      {model.loading ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {model.error || model.stale ? (
        <div role="alert">
          <p className="text-danger">
            {model.stale
              ? t`The roster changed. Review a fresh snapshot before saving.`
              : t`Could not save seat order`}
          </p>
          <Button
            variant="secondary"
            onPress={() => {
              void model.start();
            }}
          >{t`Review latest roster`}</Button>
        </div>
      ) : null}
      <p className="text-sm text-muted">{t`Locked places stay fixed. Move unlocked players or pending invitations between seats and the waiting list. Manual mode preserves empty places; Assisted may rearrange unlocked players.`}</p>
      {[false, true].map((waiting) => (
        <section
          key={String(waiting)}
          className="space-y-3"
          aria-label={waiting ? t`Waiting list` : t`Seats list`}
        >
          <EventSeatListHeading waiting={waiting} />
          <WindowedList
            items={waiting ? model.places.waiting : model.places.seated}
            itemKey={(item) => item.key}
            label={waiting ? t`Waiting list` : t`Seats list`}
            estimatedRowHeight={80}
            onEndReached={() => {}}
            renderItem={(item) => {
              if (item.kind === "empty")
                return (
                  <div className="relative flex min-w-0 items-center gap-2 rounded-xl bg-surface p-3 pl-4">
                    <UserRoundPlus className="size-5 text-muted" aria-hidden />
                    <span className="text-muted">
                      {t`Free place`}: {item.first + 1}
                      {item.last > item.first ? `–${item.last + 1}` : ""}
                    </span>
                  </div>
                );
              const { row, index } = item;
              const seated = row.seatIndex !== null;
              const roles = tableUserRoles({
                ...row,
                demonstrator: row.userId === demonstratorUserId,
                position: seated ? "SEATED" : "WAITING",
              });
              return (
                <div
                  data-seat-order-row={row.id}
                  className="relative flex min-w-0 items-center gap-2 rounded-xl bg-surface p-3 pl-4"
                >
                  <UserIdentity
                    name={formatUsername(row.username, row.name ?? t`Username unavailable`)}
                    avatarUrl={row.avatarUrl}
                    badge={<UserRoleBadge roles={roles} />}
                    topBadge={
                      seated ? (
                        <IconBadge
                          icon={row.locked ? LockKeyhole : LockKeyholeOpen}
                          label={row.locked ? t`Unlock player` : t`Lock player`}
                          color={row.locked ? "danger" : "default"}
                          onPress={() => model.lock(index)}
                          isDisabled={model.busy}
                        />
                      ) : undefined
                    }
                    secondary={roles[0] ? i18n._(recordUserRoleMessages[roles[0]]) : undefined}
                  />
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label={t`Move up`}
                    data-testid={`seat-order-up-${row.id}`}
                    isDisabled={model.busy || !model.canMove(index, -1)}
                    onPress={() => model.move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label={t`Move down`}
                    data-testid={`seat-order-down-${row.id}`}
                    isDisabled={model.busy || !model.canMove(index, 1)}
                    onPress={() => model.move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              );
            }}
          />
        </section>
      ))}
      <Button
        isIconOnly
        variant="secondary"
        className="fixed left-6 z-40 size-14 rounded-full"
        style={floatingActionPositionStyle}
        aria-label={t`Discard unsaved order`}
        data-testid="seat-order-discard"
        isDisabled={model.busy}
        onPress={model.reset}
      >
        <RotateCcw className="size-5" />
      </Button>
      <Button
        isIconOnly
        variant="primary"
        className="fixed right-6 z-40 size-14 rounded-full bg-success text-success-foreground"
        style={floatingActionPositionStyle}
        aria-label={t`Save seat order`}
        data-testid="seat-order-save"
        isDisabled={model.loading || model.busy || model.stale || !model.rows.length}
        onPress={() => void model.save()}
      >
        <Check className="size-5" />
      </Button>
    </section>
  );
}
