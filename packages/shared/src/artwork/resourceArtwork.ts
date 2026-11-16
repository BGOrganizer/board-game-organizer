import { Avatar, Style } from "@dicebear/core";
import events from "./definitions/bgo-events.json" with { type: "json" };
import groups from "./definitions/bgo-groups.json" with { type: "json" };
import tables from "./definitions/bgo-tables.json" with { type: "json" };

export const resourceArtworkDefinitions = { events, tables, groups };
export type ResourceArtworkKind = keyof typeof resourceArtworkDefinitions;
export type ResourceArtwork = {
  readonly svg: string;
  readonly options: Readonly<Record<string, unknown>>;
};

const styles = {
  events: new Style(events),
  tables: new Style(tables),
  groups: new Style(groups),
};

/** Both clients scale this same 240px drawing; display size never changes the seeded artwork. */
export function createResourceArtwork(
  kind: ResourceArtworkKind,
  seed: string,
  animationVariant: "medium" | "none" = "medium",
): ResourceArtwork {
  const { svg, options } = new Avatar(styles[kind], { seed, animationVariant }).toJSON();
  return { svg, options: { ...options } };
}
