import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";
import { navigationColors } from "../navigationColors";

it.each(["light", "dark", "custom-brand"])(
  "maps every navigation color to fresh HeroUI tokens in %s",
  (name) => {
    const colors = {
      background: `${name}-background`,
      foreground: `${name}-foreground`,
      surface: `${name}-surface`,
      separator: `${name}-separator`,
      accent: `${name}-accent`,
      danger: `${name}-danger`,
    };
    expect(navigationColors(colors)).toEqual({
      background: colors.background,
      text: colors.foreground,
      card: colors.surface,
      border: colors.separator,
      primary: colors.accent,
      notification: colors.danger,
    });
  },
);

it("keeps white accent labels/icons and one shared light/dark accent calibration in the theme entries", () => {
  const root = fileURLToPath(new URL("../../../../../", import.meta.url));
  const tokens = (file: string, name: string) =>
    [
      ...readFileSync(`${root}${file}`, "utf8").matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g")),
    ].map((match) => match[1].trim());
  const webAccent = tokens("apps/web/src/app/globals.css", "accent");
  const nativeAccent = tokens("apps/mobile/global.css", "accent");
  expect(webAccent).toHaveLength(2);
  expect(nativeAccent).toEqual(webAccent);
  expect(new Set(webAccent).size).toBe(1);
  for (const file of ["apps/mobile/global.css", "apps/web/src/app/globals.css"])
    expect(tokens(file, "accent-foreground")).toEqual(["var(--snow)", "var(--snow)"]);
});

it("keeps both clients' runtime UI free of literal palettes and obsolete HeroUI v2 color classes", () => {
  const root = fileURLToPath(new URL("../../../../../", import.meta.url));
  const violations: string[] = [];
  let files = 0;
  const palette =
    /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:\b|-)|\b(?:bg|text|border|ring)-(?:default-\d+|primary(?:-foreground)?|secondary)(?:\b|\/)|\bshadow-(?:sm|md|lg|xl|2xl)\b/;
  const literal = /^#[\da-f]{3,8}$/i;
  function visitDirectory(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === "__tests__" || /\.test\./.test(entry.name)) continue;
      const file = `${path}/${entry.name}`;
      if (entry.isDirectory()) {
        visitDirectory(file);
        continue;
      }
      if (!/\.(tsx?|css)$/.test(file)) continue;
      files++;
      const source = readFileSync(file, "utf8");
      const relative = file.slice(root.length);
      const inspect = (value: string, line: number) => {
        if (
          literal.test(value.trim()) ||
          /\b(?:rgba?|hsla?|oklch)\(/.test(value) ||
          palette.test(value)
        )
          violations.push(`${relative}:${line}: ${value}`);
      };
      if (file.endsWith(".css")) {
        // Theme entry points may define HeroUI variables; runtime selectors must consume them.
        const css = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[\w-]+\s*:[^;]+;/g, "");
        inspect(css, 1);
        if (/#[\da-f]{3,8}\b/i.test(css))
          violations.push(`${relative}: literal CSS color outside a theme variable`);
        continue;
      }
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (
          ts.isStringLiteralLike(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)
        ) {
          inspect(node.text, parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1);
          const parent = node.parent;
          if (
            (ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent)) &&
            /color|background|fill|stroke/i.test(parent.name.getText(parsed)) &&
            /^(white|black|gray|grey|blue|red|green|yellow|orange|purple|pink|cyan|magenta|lime|teal|navy|maroon|olive|silver|aqua|fuchsia)$/i.test(
              node.text,
            )
          )
            violations.push(`${relative}: named CSS color ${node.text}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(parsed);
    }
  }
  for (const app of ["mobile", "web"]) visitDirectory(`${root}apps/${app}/src`);
  expect(files).toBeGreaterThan(300);
  expect(violations).toEqual([]);
});
