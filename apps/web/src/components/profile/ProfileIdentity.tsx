"use client";

import { useUser } from "@clerk/nextjs";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";
import { ProfileIdentityRow } from "./ProfileIdentityRow";

export function ProfileIdentity({
  ownerId,
  ...identity
}: Omit<ComponentProps<typeof ProfileIdentityRow>, "children"> & { ownerId?: string }) {
  return (
    <ProfileIdentityRow {...identity}>
      {ownerId ? <JoinedAt ownerId={ownerId} /> : null}
    </ProfileIdentityRow>
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
