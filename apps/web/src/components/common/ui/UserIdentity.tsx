"use client";

import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { UserAvatar } from "./UserAvatar";

export function UserIdentity({
  name,
  avatarUrl,
  avatarContent,
  secondary,
  badge,
  topBadge,
  titleAccessory,
  children,
  online,
  onPress,
  isDisabled,
  accessibilityLabel,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarContent?: ReactNode;
  secondary?: string | null;
  badge?: ReactNode;
  topBadge?: ReactNode;
  titleAccessory?: ReactNode;
  children?: ReactNode;
  online?: boolean;
  onPress?: () => void;
  isDisabled?: boolean;
  accessibilityLabel?: string;
}) {
  const title = <span className="min-w-0 truncate font-medium">{name}</span>;
  return (
    <>
      <span className="inline-flex min-h-16 w-13 shrink-0 items-center">
        <UserAvatar
          name={name}
          avatarUrl={avatarUrl}
          avatarContent={avatarContent}
          size="md"
          online={online}
          badge={badge}
          topBadge={topBadge}
          style={{ marginRight: 0, marginTop: 0, marginBottom: 0 }}
        />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex min-w-0 items-center gap-2">
          {onPress ? (
            <Button
              variant="ghost"
              className="h-auto min-h-11 min-w-0 flex-1 justify-start whitespace-normal px-0 text-left"
              aria-label={accessibilityLabel ?? name}
              isDisabled={isDisabled}
              onPress={onPress}
            >
              {title}
            </Button>
          ) : (
            title
          )}
          {titleAccessory}
        </span>
        {secondary ? <span className="block truncate text-sm text-muted">{secondary}</span> : null}
        {children}
      </span>
    </>
  );
}
