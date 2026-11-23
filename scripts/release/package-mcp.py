#!/usr/bin/env python3
"""Write a portable Board Game Organizer MCP plugin ZIP to stdout."""

import argparse
import json
from pathlib import Path
import re
import sys
from zipfile import ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[2]
WEBSITE = "https://board-game-organizer.com"
REPOSITORY = "https://github.com/BGOrganizer/board-game-organizer"
ENDPOINTS = {
    "development": "https://bgo-mcp-development.vercel.app/mcp",
    "production": "https://api.board-game-organizer.com/mcp",
}
LOGO = "./assets/bgo.webp"
SCHEMAS = "https://agent-plugins.org/schemas/1.0.0"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("environment", choices=ENDPOINTS)
parser.add_argument("version")
args = parser.parse_args()
if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*)?", args.version):
    parser.error("expected a BGO release or prerelease version")

development = args.environment == "development"
title = "Board Game Organizer Dev" if development else "Board Game Organizer"
slug = "board-game-organizer-dev" if development else "board-game-organizer"
description = "Organize board game nights and explore your tables, groups, and rankings."
manifest = {
    "$schema": f"{SCHEMAS}/plugin.schema.json",
    "name": slug,
    "version": args.version,
    "description": description,
    "author": {"name": "Board Game Organizer", "url": WEBSITE},
    "homepage": WEBSITE,
    "repository": REPOSITORY,
    "license": "AGPL-3.0-only",
    "extensions": {
        "com.openai": {
            "interface": {
                "displayName": title,
                "shortDescription": description,
                "longDescription": (
                    "Find board game events, browse tables and groups, and see your results "
                    "and OpenSkill ratings from your Board Game Organizer account."
                ),
                "developerName": "Board Game Organizer",
                "category": "Productivity",
                "capabilities": ["Find events and tables", "Organize a group", "View results and rankings"],
                "websiteURL": WEBSITE,
                "supportURL": f"{REPOSITORY}/issues",
                "logo": LOGO,
                "composerIcon": LOGO,
            },
        },
    },
}
mcp = {
    "$schema": f"{SCHEMAS}/mcp.schema.json",
    "mcpServers": {
        slug: {
            "type": "streamable-http",
            "url": ENDPOINTS[args.environment],
            "extensions": {"com.openai": {"auth": {"type": "oauth", "client": {"mode": "cimd"}}}},
        },
    },
}

# Fixed ZIP entry metadata keeps checksums stable when a publication is retried.
with ZipFile(sys.stdout.buffer, "w") as archive:
    for name, data in [
        ("plugin.json", (json.dumps(manifest, indent=2) + "\n").encode()),
        ("mcp.json", (json.dumps(mcp, indent=2) + "\n").encode()),
        (LOGO[2:], (ROOT / "apps/site/public/images/app-icon.webp").read_bytes()),
        ("LICENSE", (ROOT / "LICENSE").read_bytes()),
    ]:
        archive.writestr(ZipInfo(name), data)
