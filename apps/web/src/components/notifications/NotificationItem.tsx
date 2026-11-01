"use client";
import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";

/** Count workflow is owned by the enclosing batched scope, never by each row. */
export function NotificationItem({
  itemId,
  readOnly = false,
  children,
}: {
  itemId?: string;
  readOnly?: boolean;
  children?: ReactNode;
}) {
  const attention = useNotificationAttentionContext(),
    { t } = useLingui();
  const element = useRef<HTMLDivElement>(null),
    positioned = useRef<string | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("attention");
    if (itemId && requested === itemId && positioned.current !== requested && element.current) {
      element.current.scrollIntoView?.({ block: "center" });
      positioned.current = requested;
    }
  });
  const target = itemId ? { kind: "item" as const, id: itemId } : undefined;
  const count = target ? attention?.get(target)?.count : undefined;
  if (!target) return <>{children}</>;
  if (!children && !count) return null;
  return (
    <div
      ref={element}
      id={`attention-${target.id}`}
      className={`flex min-w-0 scroll-mt-24 items-center gap-2 ${children ? "w-full" : "shrink-0"}`}
    >
      <NotificationCountBadge count={count} />
      {children ? <div className="min-w-0 flex-1">{children}</div> : null}
      {readOnly && count ? (
        <Button
          isIconOnly
          size="sm"
          variant="secondary"
          className="min-h-11 min-w-11"
          aria-label={t`Mark as read`}
          onPress={() => attention?.read(target)}
        >
          <Check className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
