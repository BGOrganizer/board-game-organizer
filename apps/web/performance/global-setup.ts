import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default function setup() {
  const directory = fileURLToPath(new URL("../.reassure/", import.meta.url));
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}current.perf`, "");
  writeFileSync(
    `${directory}current.metadata.json`,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        node: process.version,
        architecture: process.arch,
        platform: process.platform,
        arguments: process.execArgv,
        instrumentedCoverage: false,
        renderer: "React DOM in jsdom",
        runs: 10,
        warmupRuns: 1,
      },
      null,
      2,
    ),
  );
}
