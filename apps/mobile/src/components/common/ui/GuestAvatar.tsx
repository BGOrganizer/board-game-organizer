import { Avatar, Style } from "@dicebear/core";
import clay from "@dicebear/styles/clay.json" with { type: "json" };
import { useMemo } from "react";
import { SvgXml } from "react-native-svg";

const style = new Style(clay);

/** Clay artwork is generated locally from the guest's display name. */
export function GuestAvatar({ name }: { name: string }) {
  const artwork = useMemo(
    () => new Avatar(style, { seed: name, animationVariant: "none" }).toString(),
    [name],
  );
  return <SvgXml xml={artwork} width="100%" height="100%" accessible={false} />;
}
