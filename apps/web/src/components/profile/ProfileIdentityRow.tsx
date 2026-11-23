import type { ReactNode } from "react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { UserIdentity } from "@/components/common/ui/UserIdentity";

export function ProfileIdentityRow({
  name,
  username,
  avatarUrl,
  children,
}: {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  children?: ReactNode;
}) {
  return (
    <GroupedRow className="flex-col items-start">
      <div className="flex w-full min-w-0 items-center gap-2">
        <UserIdentity
          name={name}
          avatarUrl={avatarUrl}
          secondary={username ? `@${username}` : undefined}
        />
      </div>
      {children}
    </GroupedRow>
  );
}
