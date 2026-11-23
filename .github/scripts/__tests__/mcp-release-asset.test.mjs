import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mcpReleaseAsset } from "../../../scripts/release/mcp-release-asset.mjs";

test("MCP release archives include the BGO icon, license and matching remote OAuth configuration", async () => {
  for (const [environment, version, name, endpoint] of [
    ["production", "1.10.0", "Board Game Organizer", "https://api.board-game-organizer.com/mcp"],
    [
      "development",
      "1.9.0-dev.pr.33.sha-0123456789ab",
      "Board Game Organizer Dev",
      "https://bgo-mcp-development.vercel.app/mcp",
    ],
  ]) {
    const asset = mcpReleaseAsset(environment, version);
    assert.equal(asset.digest, mcpReleaseAsset(environment, version).digest);
    assert.equal(asset.name, `board-game-organizer-mcp-${version}.zip`);
    const { paths, manifest, mcp, icon, license } = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          `from io import BytesIO
import json
import sys
from zipfile import ZipFile
with ZipFile(BytesIO(sys.stdin.buffer.read())) as archive:
    print(json.dumps(dict(
        paths=archive.namelist(),
        manifest=json.loads(archive.read("plugin.json")),
        mcp=json.loads(archive.read("mcp.json")),
        icon=archive.read("assets/bgo.webp").hex(),
        license=archive.read("LICENSE").decode(),
    )))`,
        ],
        { input: Buffer.from(await asset.body.arrayBuffer()), encoding: "utf8" },
      ),
    );
    assert.deepEqual(paths, ["plugin.json", "mcp.json", "assets/bgo.webp", "LICENSE"]);
    assert.equal(manifest.version, version);
    assert.equal(manifest.license, "AGPL-3.0-only");
    const listing = manifest.extensions["com.openai"].interface;
    assert.equal(listing.displayName, name);
    assert.equal(listing.logo, "./assets/bgo.webp");
    assert.equal(listing.composerIcon, listing.logo);
    assert.equal(icon, readFileSync("apps/site/public/images/app-icon.webp").toString("hex"));
    assert.equal(license, readFileSync("LICENSE", "utf8"));
    assert.deepEqual(mcp.mcpServers, {
      [manifest.name]: {
        type: "streamable-http",
        url: endpoint,
        extensions: { "com.openai": { auth: { type: "oauth", client: { mode: "cimd" } } } },
      },
    });
  }
});
