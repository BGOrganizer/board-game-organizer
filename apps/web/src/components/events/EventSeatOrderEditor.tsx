"use client";
import { formatUsername, type useTableSeatOrder } from "@board-game-organizer/shared";
import { Button, Chip, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowUp, Check, LockKeyhole, LockKeyholeOpen, RotateCcw } from "lucide-react";
import { useState } from "react";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
export function EventSeatOrderEditor({ model }: { model: ReturnType<typeof useTableSeatOrder> }) {
  const { t } = useLingui();
  const [page, setPage] = useState(0);
  const offset = page * 40;
  return (
    <section className="space-y-3 pb-20" aria-label={t`Reorder seats`}>
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
              setPage(0);
              void model.start();
            }}
          >{t`Review latest roster`}</Button>
        </div>
      ) : null}
      {model.rows.slice(offset, offset + 40).map((row, position) => {
        const index = offset + position;
        return (
          <div key={row.id} className="flex items-center gap-2 rounded-xl bg-surface p-3">
            <UserIdentity
              name={formatUsername(row.username, row.name ?? t`Username unavailable`)}
              avatarUrl={row.avatarUrl}
              secondary={index < model.seatedCount ? t`Seats list` : t`Waiting list`}
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
                {index < model.seatedCount ? (
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label={row.locked ? t`Unlock player` : t`Lock player`}
                    isDisabled={model.busy}
                    onPress={() => model.lock(index)}
                  >
                    <Chip color={row.locked ? "danger" : "default"} variant="soft">
                      {row.locked ? (
                        <LockKeyhole className="size-4" />
                      ) : (
                        <LockKeyholeOpen className="size-4" />
                      )}
                    </Chip>
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        );
      })}
      {offset > 0 ? (
        <Button
          variant="secondary"
          onPress={() => setPage((value) => value - 1)}
        >{t`Previous page`}</Button>
      ) : null}
      {offset + 40 < model.rows.length ? (
        <Button
          variant="secondary"
          onPress={() => setPage((value) => value + 1)}
        >{t`Next page`}</Button>
      ) : null}
      <p className="text-sm text-muted">{t`Locked players are protected from assistance. Unlock a player before moving them. Pending invitations keep their reserved places.`}</p>
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
