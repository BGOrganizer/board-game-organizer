"use client";

import { useUser } from "@clerk/nextjs";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { UserIdentity } from "@/components/common/ui/UserIdentity";

export function ProfileIdentity({
  name,
  username,
  avatarUrl,
  ownerId,
}: {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  ownerId?: string;
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
      {ownerId ? <JoinedAt ownerId={ownerId} /> : null}
    </GroupedRow>
  );
}

function JoinedAt({ ownerId }: { ownerId: string }) {
  const { user, isLoaded } = useUser();
  const { t, i18n } = useLingui();
  const date = user?.id === ownerId ? user.createdAt : null;
  return (
    <div
      className="flex flex-wrap items-center gap-1 text-sm text-muted"
      data-testid="profile-joined-at"
    >
      <span>{t`Joined on`}:</span>
      {!isLoaded ? (
        <Skeleton aria-label={t`Loading…`} className="h-4 w-28 rounded" />
      ) : date ? (
        <time dateTime={date.toISOString()}>{i18n.date(date, { dateStyle: "long" })}</time>
      ) : (
        <span>—</span>
      )}
    </div>
  );
}
