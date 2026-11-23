"use client";

import type { ContactUser } from "@board-game-organizer/shared";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { UserMenuActions } from "./UserMenuActions";

export type { FriendRequestContext, UserActionKey } from "./UserMenuActions";

export function UserMenu({
  user,
  ...props
}: Omit<ComponentProps<typeof UserMenuActions>, "onProfile" | "user"> & { user: ContactUser }) {
  const router = useRouter();
  return (
    <UserMenuActions
      {...props}
      user={user}
      onProfile={() => router.push(`/profiles/${encodeURIComponent(user.id)}`)}
    />
  );
}
