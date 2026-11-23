"use client";

import { Button, Chip, Popover } from "@heroui/react";
import { type LucideIcon, Plus } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  icon: LucideIcon;
  label: string;
  color?: "default" | "accent" | "success" | "warning" | "danger";
  multiple?: boolean;
  size?: "sm" | "md";
} & (
  | { onPress: () => void; isDisabled?: boolean; title?: never; children?: never }
  | { title: string; children: ReactNode; onPress?: never; isDisabled?: never }
  | { onPress?: never; title?: never; children?: never; isDisabled?: never }
);

/** Compact visual badge with a 44px target for interactive modes. */
export function IconBadge({
  icon: Icon,
  label,
  color = "default",
  multiple,
  size = "sm",
  onPress,
  isDisabled,
  title,
  children,
}: Props) {
  const symbol = (
    <Chip
      color={color}
      variant="secondary"
      className={`relative min-h-0 min-w-0 justify-center overflow-hidden rounded-full p-0 ${size === "md" ? "size-7" : "size-[22px]"}`}
      aria-hidden="true"
    >
      <Icon
        className={`m-0 shrink-0 ${size === "md" ? "size-4" : "size-[13px]"} ${isDisabled ? "opacity-50" : ""}`}
      />
      {multiple ? (
        <Plus
          className={`absolute top-0.5 right-0.5 m-0 size-2 rounded-full bg-default ${isDisabled ? "opacity-50" : ""}`}
        />
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
        className="size-11 min-h-11 min-w-11 bg-transparent p-0"
        style={{ opacity: 1 }}
      >
        {symbol}
      </Button>
    );
  if (title)
    return (
      <Popover>
        <Button
          isIconOnly
          variant="ghost"
          aria-label={label}
          className="size-11 min-h-11 min-w-11 bg-transparent p-0"
        >
          {symbol}
        </Button>
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
