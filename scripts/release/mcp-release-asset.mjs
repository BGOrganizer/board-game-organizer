import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const packager = fileURLToPath(new URL("./package-mcp.py", import.meta.url));

export function mcpReleaseAsset(environment, version) {
  const bytes = execFileSync("python3", [packager, environment, version], {
    env: { PATH: process.env.PATH },
  });
  return {
    name: `board-game-organizer-mcp-${version}.zip`,
    body: new Blob([bytes], { type: "application/zip" }),
    size: bytes.length,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}
