"use client";

import { Button, Chip, Popover } from "@heroui/react";
import { type LucideIcon, Plus } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  icon: LucideIcon;
  label: string;
  color?: "default" | "accent" | "success" | "warning" | "danger";
  multiple?: boolean;
} & (
  | { onPress: () => void; isDisabled?: boolean; title?: never; children?: never }
  | { title: string; children: ReactNode; onPress?: never; isDisabled?: never }
  | { onPress?: never; title?: never; children?: never; isDisabled?: never }
);

/** A 22px visual badge; interactive modes retain a 44px target. */
export function IconBadge({
  icon: Icon,
  label,
  color = "default",
  multiple,
  onPress,
  isDisabled,
  title,
  children,
}: Props) {
  const symbol = (
    <Chip
      color={color}
      variant="soft"
      className="relative size-[22px] min-h-0 min-w-0 overflow-hidden rounded-full p-0"
      aria-hidden="true"
    >
      <Icon className="size-[13px] shrink-0" />
      {multiple ? (
        <Plus className="absolute top-0.5 right-0.5 size-2 rounded-full bg-background" />
      ) : null}
    </Chip>
  );
  if (onPress)
    return (
      <Button
        isIconOnly
        variant="ghost"
        aria-label={label}
        onPress={onPress}
        isDisabled={isDisabled}
        className="size-11 min-h-11 min-w-11 p-0"
      >
        {symbol}
      </Button>
    );
  if (title)
    return (
      <Popover>
        <Popover.Trigger
          aria-label={label}
          className="button button--ghost relative inline-flex size-11 min-h-11 min-w-11 items-center justify-center p-0"
        >
          {symbol}
        </Popover.Trigger>
        <Popover.Content placement="bottom start" className="max-w-[calc(100vw-2rem)]">
          <Popover.Dialog className="whitespace-normal break-words p-3 text-sm">
            <Popover.Heading>{title}</Popover.Heading>
            {children}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    );
  return (
    <span role="img" aria-label={label} className="inline-flex">
      {symbol}
    </span>
  );
}
