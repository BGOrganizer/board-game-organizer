"use client";
import {
  formatUsername,
  tableUserRoles,
  type useTableSeatOrder,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowUp, Check, LockKeyhole, LockKeyholeOpen, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
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
    <section className="space-y-3 pb-20" aria-label={t`Reorder seats`}>
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
      <p className="text-sm text-muted">{t`Locked players are protected from assistance. Unlock a player before moving them. Pending invitations keep their reserved places.`}</p>
      {[false, true].map((waiting) => (
        <section
          key={String(waiting)}
          className="space-y-3"
          aria-label={waiting ? t`Waiting list` : t`Seats list`}
        >
          <EventSeatListHeading waiting={waiting} />
          <GroupedList>
            {model.rows.map((row, index) => {
              if (index >= model.seatedCount !== waiting) return null;
              const roles = tableUserRoles({
                ...row,
                demonstrator: row.userId === demonstratorUserId,
                position: index < model.seatedCount ? "SEATED" : "WAITING",
              });
              return (
                <GroupedRow key={row.id}>
                  <UserIdentity
                    name={formatUsername(row.username, row.name ?? t`Username unavailable`)}
                    avatarUrl={row.avatarUrl}
                    badge={<UserRoleBadge roles={roles} />}
                    topBadge={
                      row.status === "ACCEPTED" && index < model.seatedCount ? (
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

                  {row.status === "ACCEPTED" ? (
                    <>
                      {index > 0 ? (
                        <Button
                          isIconOnly
                          variant="ghost"
                          aria-label={t`Move up`}
                          isDisabled={model.busy || !model.canMove(index, -1)}
                          onPress={() => model.move(index, -1)}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                      ) : null}
                      {index < model.rows.length - 1 ? (
                        <Button
                          isIconOnly
                          variant="ghost"
                          aria-label={t`Move down`}
                          isDisabled={model.busy || !model.canMove(index, 1)}
                          onPress={() => model.move(index, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </GroupedRow>
              );
            })}
          </GroupedList>
        </section>
      ))}

      <Button
        isIconOnly
        variant="secondary"
        className="fixed bottom-6 left-6 z-40 size-14 rounded-full"
        aria-label={t`Discard unsaved order`}
        isDisabled={model.busy}
        onPress={model.reset}
      >
        <RotateCcw className="size-5" />
      </Button>
      <Button
        isIconOnly
        variant="primary"
        className="fixed right-6 bottom-6 z-40 size-14 rounded-full bg-success text-success-foreground"
        aria-label={t`Save seat order`}
        isDisabled={model.loading || model.busy || model.stale || !model.rows.length}
        onPress={() => void model.save()}
      >
        <Check className="size-5" />
      </Button>
    </section>
  );
}
