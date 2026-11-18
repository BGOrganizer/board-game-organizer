import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import {
  createResourceArtwork,
  type ResourceArtworkKind,
} from "@board-game-organizer/shared/artwork";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: string; props: Record<string, unknown> };
type Props = {
  seed: string;
  variant: ResourceArtworkKind;
  size?: number;
  presentation?: "thumbnail" | "cover" | "background";
};
const source = readFileSync(
  new URL("../../components/common/ui/AnimatedDicebearArtwork.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

// Verify host contracts and generation memoization; this does not measure native parsing or frames.
function harness() {
  let previous: { deps: readonly unknown[]; value: unknown } | undefined;
  const generate = vi.fn(createResourceArtwork);
  const memo = vi.fn((component: (props: Props) => Element) => component);
  const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });
  const modules: Record<string, unknown> = {
    "@board-game-organizer/shared/artwork": { createResourceArtwork: generate },
    react: {
      memo,
      useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
        if (!previous || deps.some((value, index) => !Object.is(value, previous?.deps[index])))
          previous = { deps, value: factory() };
        return previous.value;
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { View: "View" },
    "react-native-svg": { SvgXml: "SvgXml" },
    uniwind: { ScopedTheme: "ScopedTheme" },
    "./AnimatedDetailArtwork": { AnimatedDetailArtwork: "AnimatedDetailArtwork" },
  };
  const output = {} as { AnimatedDicebearArtwork(props: Props): Element };
  runInNewContext(compiled, {
    exports: output,
    require: (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected artwork dependency ${name}`);
      return modules[name];
    },
  });
  return { render: output.AnimatedDicebearArtwork, generate, memo };
}
const child = (element: Element) => element.props.children as Element;
const drawing = (element: Element) => child(child(child(element)));

it.each(["groups", "events", "tables"] as const)(
  "keeps the complete canonical %s SVG across all presentations and 40/64/96px frames",
  (variant) => {
    const h = harness();
    const expected = createResourceArtwork(variant, "resource-id", "none").svg;
    for (const presentation of ["thumbnail", "cover", "background"] as const) {
      for (const size of [40, 64, 96]) {
        const root = h.render({ seed: "resource-id", variant, presentation, size });
        const scope = child(root),
          surface = child(scope),
          content = child(surface),
          svg = presentation === "background" ? child(content) : content;
        if (presentation === "background") {
          expect(content.type).toBe("AnimatedDetailArtwork");
          expect((content.props.artwork as { svg: string }).svg).toBe(expected);
        } else expect(content.type).toBe("SvgXml");
        expect(root.type).toBe("View");
        expect(root.props).toMatchObject({
          accessible: false,
          importantForAccessibility: "no-hide-descendants",
          pointerEvents: "none",
          testID: `dicebear-${variant}-image`,
        });
        expect(root.props).not.toHaveProperty("onLayout");
        expect(root.props.style).toEqual(
          presentation === "thumbnail"
            ? { width: size, height: size, flexShrink: 0, borderRadius: 12, overflow: "hidden" }
            : { position: "absolute", inset: 0, borderRadius: 12, overflow: "hidden" },
        );
        expect(scope.type).toBe("ScopedTheme");
        expect(scope.props.theme).toBe("light");
        expect(surface.props.className).toBe("bg-surface");
        expect(surface.props.style).toEqual({ flex: 1, padding: presentation === "cover" ? 4 : 0 });
        expect(svg.type).toBe("SvgXml");
        expect(svg.props).toEqual({
          xml: expected,
          width: "100%",
          height: "100%",
          preserveAspectRatio: "xMidYMid meet",
        });
        expect(expected).not.toContain("@keyframes");
      }
    }
    expect(h.memo).toHaveBeenCalledOnce();
    expect(h.generate).toHaveBeenCalledExactlyOnceWith(variant, "resource-id", "none");
  },
);

it("defaults to a 64px thumbnail and reuses generation across presentation-only changes", () => {
  const h = harness();
  const props: Props = { seed: "draft-table-key", variant: "tables" };
  const initial = h.render(props);
  expect(initial.props.style).toMatchObject({ width: 64, height: 64 });
  const background = h.render({ ...props, presentation: "background" });
  expect(child(drawing(background)).props.xml).toBe(drawing(initial).props.xml);
  expect(h.generate).toHaveBeenCalledOnce();
  h.render({ ...props, seed: "saved-table-id" });
  expect(h.generate).toHaveBeenLastCalledWith("tables", "saved-table-id", "none");
  const group = h.render({ seed: "saved-table-id", variant: "groups" });
  expect(h.generate).toHaveBeenLastCalledWith("groups", "saved-table-id", "none");
  expect(drawing(group).props.xml).toBe(
    createResourceArtwork("groups", "saved-table-id", "none").svg,
  );
  expect(h.generate).toHaveBeenCalledTimes(3);
});
