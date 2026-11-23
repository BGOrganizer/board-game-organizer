import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwind from "@tailwindcss/postcss";
import { build } from "vite";

const app = new URL("./", import.meta.url);
const result = await build({
  configFile: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  root: fileURLToPath(app),
  plugins: [lingui(), babel({ presets: [linguiTransformerBabelPreset()] })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../web/src/", app)) },
    dedupe: [
      "react",
      "react-dom",
      "@heroui/react",
      "@lingui/core",
      "@lingui/react",
      "@tanstack/react-query",
    ],
  },
  css: { postcss: { plugins: [tailwind()] } },
  oxc: { jsx: { runtime: "automatic" } },
  build: {
    lib: {
      entry: fileURLToPath(new URL("src/ui/main.tsx", app)),
      name: "BoardGameOrganizer",
      formats: ["iife"],
    },
    write: false,
    cssCodeSplit: false,
    target: "es2022",
  },
});
const bundles = Array.isArray(result) ? result : [result];
const [bundle] = bundles;
if (bundles.length !== 1 || !("output" in bundle)) throw new Error("Unexpected widget bundle");
const [script] = bundle.output.filter((output) => output.type === "chunk");
const [style] = bundle.output.filter((output) => output.type === "asset");
if (bundle.output.length !== 2 || !script || !style || !style.fileName.endsWith(".css")) {
  throw new Error("Expected one script and one stylesheet in the widget bundle");
}

const js = script.code.replaceAll(/<\/script/gi, "<\\/script");
const css = style.source.toString().replaceAll(/<\/style/gi, "\\3c /style");
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Board Game Organizer</title>
  <style>${css}</style>
</head>
<body>
  <main id="root"></main>
  <script>${js}</script>
</body>
</html>
`;
await mkdir(new URL("dist/", app), { recursive: true });
await writeFile(new URL("dist/widget.html", app), html);
