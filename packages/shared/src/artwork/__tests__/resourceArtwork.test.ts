import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Avatar, Style } from "@dicebear/core";
import { expect, it } from "vitest";
import {
  createResourceArtwork,
  type ResourceArtworkKind,
  resourceArtworkDefinitions,
} from "../resourceArtwork";

const approved = {
  events: "f6fc61977c02b55e4491faa2de07bbb4fba4464e44d5d95d9b34f4742b19678f",
  tables: "05e9d1d1cfaba721dd81e5e6b41bc47f03c79ad3247e04b914109d79ad1b1193",
  groups: "6199abf8a3d9d928eb0ddfc7776ae9b95abe46d09b468e3ae90b373fd7fe5974",
} satisfies Record<ResourceArtworkKind, string>;

it.each(Object.keys(approved) as ResourceArtworkKind[])(
  "keeps the approved %s definition byte-for-byte and its Waves palette",
  (kind) => {
    const bytes = readFileSync(new URL(`../definitions/bgo-${kind}.json`, import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(approved[kind]);
    const definition = resourceArtworkDefinitions[kind];
    expect(definition.colors).toEqual(resourceArtworkDefinitions.events.colors);
    expect(definition.meta.license.name).toBe("AGPL-3.0-only");
  },
);

it.each(Object.keys(approved) as ResourceArtworkKind[])(
  "generates deterministic %s artwork with the resource seed and approved medium motion",
  (kind) => {
    const result = createResourceArtwork(kind, "resource-123");
    expect(result).toEqual(createResourceArtwork(kind, "resource-123"));
    expect(result.svg).not.toBe(createResourceArtwork(kind, "resource-456").svg);
    expect(result.svg).toContain('viewBox="0 0 240 240"');
    expect(result.svg).toContain("@keyframes");
    expect(result.svg).toContain("prefers-reduced-motion: no-preference");
    expect(result.options).toMatchObject({
      animationVariant: "medium",
      inkColor: ["#000000"],
      paperColor: ["#ffffff"],
    });
    expect(result.options.accentColor).toEqual([expect.any(String)]);
    expect(resourceArtworkDefinitions[kind].colors.accent.values).toContain(
      (result.options.accentColor as string[])[0],
    );
  },
);

it.each([
  ["events", "calendar"],
  ["tables", "table"],
  ["groups", "crest"],
] as const)("retains every %s silhouette, miniature and resource variant", (kind, primary) => {
  const definition = resourceArtworkDefinitions[kind];
  const main = definition.components[primary as keyof typeof definition.components];
  const silhouettes = Object.keys(main.variants);
  expect(silhouettes).toHaveLength(6);
  const miniatures = ["house", "castle", "ship"];
  const extras = ["harvest", "lumber", "crystal"];
  const style = new Style<unknown>(definition);
  for (const [index, silhouette] of silhouettes.entries()) {
    const miniature = miniatures[index % miniatures.length];
    const extra = extras[index % extras.length];
    const result = new Avatar(style, {
      seed: "resource-123",
      animationVariant: "medium",
      [`${primary}Variant`]: silhouette,
      miniatureVariant: miniature,
      extrasVariant: extra,
      symbolVariant: "crown",
    }).toJSON();
    expect(result.options).toMatchObject({
      [`${primary}Variant`]: silhouette,
      miniatureVariant: miniature,
      extrasVariant: extra,
    });
    expect(result.svg).toContain(`miniature-${miniature}`);
    expect(result.svg).toContain(`extras-${extra}`);
    if (kind === "events") {
      expect(result.options.symbolVariant).toBe("crown");
      expect(result.svg).toContain("symbol-crown");
    }
  }
});

it.each(Object.keys(approved) as ResourceArtworkKind[])(
  "offers static %s artwork without changing any seeded drawing options",
  (kind) => {
    const animated = createResourceArtwork(kind, "resource-123", "medium");
    const reduced = createResourceArtwork(kind, "resource-123", "none");
    expect(reduced.options).toEqual({ ...animated.options, animationVariant: "none" });
    expect(reduced.svg).not.toContain("@keyframes");
    expect(reduced.svg).not.toContain("<style");
    expect(reduced.svg).toContain('viewBox="0 0 240 240"');
    expect(reduced).toEqual(createResourceArtwork(kind, "resource-123", "none"));
  },
);
