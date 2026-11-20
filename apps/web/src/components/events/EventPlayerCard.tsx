import { Skeleton } from "@heroui/react";
import type { ReactNode } from "react";
import { ListCard } from "@/components/common/ui/ListCard";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
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
            <UserIdentity
              name={name}
              avatarUrl={avatarUrl}
              secondary={username ? `@${username}` : "—"}
            />
          </div>
        )}
        <div className="grid grid-cols-4 gap-3">{children}</div>
        {footer}
      </div>
    </ListCard>
  );
}
