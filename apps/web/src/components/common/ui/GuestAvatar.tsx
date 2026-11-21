"use client";

import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import clay from "@dicebear/styles/clay.json" with { type: "json" };
import { Avatar } from "@heroui/react";
import { useMemo } from "react";

const style = new Style(clay);

/** Clay artwork is generated locally from the guest's display name. */
export function GuestAvatar({ name }: { name: string }) {
  const src = useMemo(
    () => new DiceBearAvatar(style, { seed: name, animationVariant: "none" }).toDataUri(),
    [name],
  );
  return <Avatar.Image src={src} alt="" />;
}
