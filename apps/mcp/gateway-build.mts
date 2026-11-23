import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_METADATA_PATH, MCP_PATH } from "./src/developmentGateway";

const output = resolve(process.argv[2] ?? ".vercel/output");
const target = process.argv[3] ?? "development";
if (target !== "development" && target !== "production")
  throw new Error("Unknown MCP gateway target");
const paths = [MCP_PATH, MCP_METADATA_PATH];
const functions = paths.map((path) => resolve(output, `functions${path}.func`));
for (const directory of functions) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, ".vc-config.json"),
    JSON.stringify({ runtime: "edge", entrypoint: "index.mjs" }),
  );
}
const [first, second] = functions;
execFileSync(
  "bun",
  [
    "build",
    fileURLToPath(new URL("./development-gateway.mts", import.meta.url)),
    "--outfile",
    resolve(first, "index.mjs"),
    "--define",
    `BGO_GATEWAY_TARGET=${JSON.stringify(target)}`,
  ],
  { cwd: dirname(fileURLToPath(import.meta.url)), stdio: "inherit" },
);
copyFileSync(resolve(first, "index.mjs"), resolve(second, "index.mjs"));
writeFileSync(resolve(output, "config.json"), JSON.stringify({ version: 3 }));
