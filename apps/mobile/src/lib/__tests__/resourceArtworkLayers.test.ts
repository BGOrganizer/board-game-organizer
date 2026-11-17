import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createResourceArtwork } from "@board-game-organizer/shared/artwork";
import type { XmlAST } from "react-native-svg";
import ts from "typescript";
import { expect, it } from "vitest";
import { artworkLayerTransform, resourceArtworkLayers } from "../resourceArtworkLayers";
import { interpolateArtworkMotion, resourceArtworkMotion } from "../resourceArtworkMotion";

const node = (
  tag: string,
  props: XmlAST["props"] = {},
  children: (XmlAST | string)[] = [],
): XmlAST => ({ tag, props, children, Tag: (() => null) as XmlAST["Tag"], parent: null });
const shape = (name: string) => node("path", { d: name });
const animated = (name: string) => node("g", { class: name }, [shape(name)]);
const scene = (components: XmlAST[], references = components.map((part) => `#${part.props.id}`)) =>
  node("svg", { viewBox: "0 0 240 240", stroke: "approved" }, [
    " ",
    node("defs", {}, [
      " ",
      ...components,
      node("clipPath", { id: "clip" }, [
        node("rect", { width: "240", height: "240", rx: "0", ry: "0" }),
      ]),
    ]),
    node("g", { clipPath: "url(#clip)" }, [
      " ",
      ...references.map((href) => node("use", { href })),
    ]),
  ]);
function paths(root: XmlAST): string[] {
  return [
    ...(root.tag === "path" ? [String(root.props.d)] : []),
    ...root.children.flatMap((child) => (typeof child === "string" ? [] : paths(child))),
  ];
}

it("splits only approved moving groups, preserving drawing order and inherited geometry", () => {
  const before = shape("before"),
    after = shape("after");
  const member = animated("bgo-groups-member-1");
  const nested = node("g", { transform: "translate(10 20) scale(2)" }, [
    node("g", { transform: "translate(-2 5)" }, [" ", member]),
  ]);
  const root = scene([
    node("g", { id: "static" }, [before]),
    node("g", { id: "members" }, [shape("between"), nested, after]),
    node("g", { id: "end" }, [node("g", { opacity: "0.5" }, [shape("end")])]),
    node("g", { id: "animation" }, [node("style", {}, ["approved CSS"])]),
  ]);
  const original = JSON.stringify(root);
  const layers = resourceArtworkLayers(root);
  expect(layers).toHaveLength(3);
  expect(layers.map((layer) => paths(layer.ast))).toEqual([
    ["before", "between"],
    ["bgo-groups-member-1"],
    ["after", "end"],
  ]);
  expect(layers[1].placement).toEqual({ x: 6, y: 30, scale: 2 });
  expect(layers[1].motion).toEqual(resourceArtworkMotion("bgo-groups-member-1"));
  expect(layers[1].ast.props).toBe(root.props);
  expect(layers[0].ast.children[0]).toBe(
    root.children[1] && (root.children[1] as XmlAST).children[1],
  );
  expect(JSON.stringify(root)).toBe(original);
  expect(
    layers.every(({ ast }) =>
      ast.children.every((child) => typeof child !== "string" && child.tag !== "defs"),
    ),
  ).toBe(true);
});

it("keeps every complete static alpha group together and resolves the seeded banner pivot", () => {
  const alpha = node("g", { opacity: "0.5" }, [shape("overlap-a"), shape("overlap-b")]);
  const root = scene([node("g", { id: "all" }, [alpha, animated("bgo-events-banner")])]);
  const layers = resourceArtworkLayers(root, "flag");
  expect(layers).toHaveLength(2);
  expect((layers[0].ast.children[0] as XmlAST).children[0]).toBe(alpha);
  expect(layers[1].motion?.origin).toEqual([179, 34]);
  expect(resourceArtworkLayers(root)).toHaveLength(1);
});

it("rejects unsupported scene, reference, ancestor transform or shared compositing changes", () => {
  for (const root of [node("svg"), node("svg", {}, [node("defs")])])
    expect(() => resourceArtworkLayers(root)).toThrow(/Missing/);
  expect(() => resourceArtworkLayers(scene([], ["#missing"]))).toThrow(/reference/);
  const unsupported = scene([node("g", { id: "part" }, [shape("static")])]);
  (unsupported.children[2] as XmlAST).children = [node("use", { href: "#part", x: "2" })];
  expect(() => resourceArtworkLayers(unsupported)).toThrow(/reference/);
  (unsupported.children[2] as XmlAST).children = [node("path", { href: "#part" })];
  expect(() => resourceArtworkLayers(unsupported)).toThrow(/reference/);
  for (const props of [{ opacity: "0.5" }, { mask: "url(#mask)" }, { transform: "rotate(5)" }]) {
    const root = scene([node("g", { id: "part", ...props }, [animated("bgo-groups-member-0")])]);
    expect(() => resourceArtworkLayers(root)).toThrow(/Unsupported/);
  }
  expect(() =>
    resourceArtworkLayers(scene([node("path", { id: "part" }, [animated("bgo-groups-member-0")])])),
  ).toThrow(/composition/);
});

it("replaces only the approved fixed viewport clip and rejects unresolved references", () => {
  const root = () => scene([node("g", { id: "part" }, [shape("one")])]);
  const definitions = (art: XmlAST) => art.children[1] as XmlAST;
  const clip = (art: XmlAST) => definitions(art).children.at(-1) as XmlAST;
  const rectangle = (art: XmlAST) => clip(art).children[0] as XmlAST;
  const cases: Array<(art: XmlAST) => void> = [
    (art) => {
      art.props.viewBox = "0 0 120 120";
    },
    (art) => {
      (art.children[2] as XmlAST).props.opacity = "0.5";
    },
    (art) => {
      (art.children[2] as XmlAST).props.clipPath = "url(#missing)";
    },
    (art) => {
      (art.children[2] as XmlAST).props.clipPath = "bad(#clip)";
    },
    (art) => {
      clip(art).tag = "g";
    },
    (art) => {
      clip(art).children.push(shape("extra"));
    },
    (art) => {
      clip(art).children = [];
    },
    (art) => {
      clip(art).children = [" "];
    },
    (art) => {
      rectangle(art).tag = "path";
    },
    (art) => {
      rectangle(art).props.transform = "rotate(5)";
    },
    ...["width", "height", "rx", "ry"].map((name) => (art: XmlAST) => {
      rectangle(art).props[name] = "3";
    }),
  ];
  for (const change of cases) {
    const art = root();
    change(art);
    expect(() => resourceArtworkLayers(art)).toThrow(/viewport clip/);
  }
  for (const props of [
    { fill: "url(#gradient)" },
    { href: "#elsewhere" },
    { xlinkHref: "#elsewhere" },
  ]) {
    const art = scene([node("g", { id: "part" }, [" ", node("path", props)])]);
    expect(() => resourceArtworkLayers(art)).toThrow(/internal definition reference/);
  }
});

it("conjugates every motion into native matrices at 40/64/96 and detail sizes", () => {
  const linear = (value: number) => value;
  for (const name of [
    "bgo-events-calendar",
    "bgo-events-banner",
    "bgo-events-accessory",
    "bgo-tables-die",
    "bgo-tables-token",
    "bgo-groups-member-0",
    "bgo-groups-member-1",
    "bgo-groups-member-2",
    "bgo-groups-badge",
  ]) {
    for (const size of [40, 64, 88, 96, 240, 390]) {
      for (const parent of [
        { x: 0, y: 0, scale: 1 },
        { x: 148, y: 151, scale: 0.72 },
      ]) {
        for (const progress of [0, 0.25, 0.5, 0.9]) {
          const { matrix: m } = interpolateArtworkMotion(
            resourceArtworkMotion(name, "stars") as NonNullable<
              ReturnType<typeof resourceArtworkMotion>
            >,
            progress,
            linear,
            true,
          );
          const gpu = artworkLayerTransform(m, parent, size / 240);
          // A point moved below its SVG ancestors must equal that raster point moved by its GPU layer.
          for (const [x, y] of [
            [0, 0],
            [-25, 31],
            [109, 178],
          ]) {
            const px = ((parent.x + parent.scale * x) * size) / 240;
            const py = ((parent.y + parent.scale * y) * size) / 240;
            expect(gpu[0] * px + gpu[4] * py + gpu[12]).toBeCloseTo(
              ((parent.x + parent.scale * (m[0] * x + m[2] * y + m[4])) * size) / 240,
            );
            expect(gpu[1] * px + gpu[5] * py + gpu[13]).toBeCloseTo(
              ((parent.y + parent.scale * (m[1] * x + m[3] * y + m[5])) * size) / 240,
            );
          }
        }
      }
    }
  }
  expect(artworkLayerTransform([1, 0, 0, 1, 0, 0], { x: 148, y: 151, scale: 0.72 }, 0)).toEqual([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]);
});

// Execute the installed parser itself; native view components are never loaded in this pure AST test.
const require = createRequire(import.meta.url);
const parser = {} as { parse(svg: string, middleware: (root: XmlAST) => XmlAST): unknown };
runInNewContext(
  ts.transpileModule(readFileSync(require.resolve("react-native-svg/src/xml.tsx"), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  {
    exports: parser,
    require: (id: string) =>
      id === "react"
        ? { Component: class {} }
        : id === "./xmlTags"
          ? { tags: new Proxy({}, { get: (_, tag) => () => String(tag) }) }
          : {},
  },
);

it.each(["events", "tables", "groups"] as const)(
  "keeps every shape and palette attribute exactly once across 60 real seeded %s variants",
  (kind) => {
    const variants = new Set<string>();
    for (let index = 0; index < 60; index++) {
      const artwork = createResourceArtwork(kind, `topology-${index}`);
      let root!: XmlAST;
      parser.parse(artwork.svg, (ast: XmlAST) => {
        root = ast;
        return { ...ast, children: [] };
      });
      const layers = resourceArtworkLayers(
        root,
        artwork.options.celebrationVariant as string | undefined,
      );
      const definitions = root.children.find(
        (child) => typeof child !== "string" && child.tag === "defs",
      ) as XmlAST;
      const components = definitions.children.filter(
        (child): child is XmlAST =>
          typeof child !== "string" &&
          child.tag === "g" &&
          !child.children.some((node) => typeof node !== "string" && node.tag === "style"),
      );
      function geometry(ast: XmlAST): string[] {
        return [
          ...(ast.tag !== "g" && ast.tag !== "svg" ? [JSON.stringify([ast.tag, ast.props])] : []),
          ...ast.children.flatMap((child) => (typeof child === "string" ? [] : geometry(child))),
        ];
      }
      expect(layers.flatMap((layer) => geometry(layer.ast))).toEqual(components.flatMap(geometry));
      for (const [name, value] of Object.entries(artwork.options))
        if (name.endsWith("Variant")) variants.add(`${name}:${value}`);
      expect(layers.filter((layer) => layer.motion)).toHaveLength(
        kind === "events" ? 3 : kind === "tables" ? 1 : 4,
      );
      expect(layers.length).toBeLessThanOrEqual(6);
    }
    for (const miniature of ["house", "castle", "ship"])
      expect(variants.has(`miniatureVariant:${miniature}`)).toBe(true);
    for (const extras of ["crystal", "harvest", "lumber"])
      expect(variants.has(`extrasVariant:${extras}`)).toBe(true);
  },
);
