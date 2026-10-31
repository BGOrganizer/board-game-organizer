import { Avatar, Skeleton } from "@heroui/react";
import type { ReactNode } from "react";
import { ListCard } from "@/components/common/ui/ListCard";
export function EventPlayerCard({
  name,
  username,
  avatarUrl,
  children,
  footer,
}: {
  name: string | undefined;
  username?: string | null;
  avatarUrl: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ListCard>
      <div className="space-y-3 p-3">
        {name === undefined ? (
          <Skeleton className="h-12 w-full rounded-lg" />
        ) : (
          <div className="flex items-center gap-3">
            <Avatar size="md">
              <Avatar.Image src={avatarUrl ?? undefined} alt="" />
              <Avatar.Fallback>{name.charAt(0) || "?"}</Avatar.Fallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold">{name}</p>
              <p className="truncate text-sm text-default-500">{username ? `@${username}` : "—"}</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-4 gap-3">{children}</div>
        {footer}
      </div>
    </ListCard>
  );
}
