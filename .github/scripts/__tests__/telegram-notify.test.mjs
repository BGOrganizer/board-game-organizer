import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sendReleaseNotification } from "../../../scripts/release/telegram-notify.mjs";

const repository = "BGOrganizer/board-game-organizer";
const github = `https://github.com/${repository}`;
const config = {
  TELEGRAM_BOT_TOKEN: "fake-unit-token",
  TELEGRAM_CHAT_ID: "-100123",
  GITHUB_REPOSITORY: repository,
  APP_ENVIRONMENT: "production",
  APP_VERSION: "1.4.1",
  PR_NUMBER: "24",
  RELEASE_URL: `${github}/releases/tag/v1.4.1`,
  APK_URL: `${github}/releases/download/v1.4.1/app.apk`,
  WEB_URL: "https://board-game-organizer.com",
};

test("the Telegram CLI sends one bounded HTML message from pinned notes and verified links", async () => {
  const folder = mkdtempSync(join(tmpdir(), "bgo-telegram-format-"));
  const file = join(folder, "notes.md");
  writeFileSync(
    file,
    `## version\n\n### 🐛 Bug Fixes\n\n- **ci:** show commit links ([aaaaaaa](${github}/commit/${"a".repeat(40)}))`,
  );
  let calls = 0;
  try {
    const id = await sendReleaseNotification(
      config,
      ["--changelog", file],
      async (url, options) => {
        calls++;
        assert.equal(url, "https://api.telegram.org/botfake-unit-token/sendMessage");
        assert.equal(options.redirect, "error");
        assert(options.signal);
        const body = JSON.parse(options.body);
        assert.equal(body.chat_id, config.TELEGRAM_CHAT_ID);
        assert.equal(body.parse_mode, "HTML");
        assert(body.text.includes(config.APK_URL));
        assert(body.text.includes("/pull/24"));
        assert(body.text.includes("/commit/"));
        assert(!body.text.includes("api.board-game-organizer.com"));
        assert(body.text.length <= 3500);
        return Response.json({ ok: true, result: { message_id: 123 } });
      },
    );
    assert.equal(id, 123);
    assert.equal(calls, 1);
    await assert.rejects(
      sendReleaseNotification({ ...config, TELEGRAM_BOT_TOKEN: "" }, ["--changelog", file]),
    );
    await assert.rejects(sendReleaseNotification(config, []));
    for (const reply of [
      new Response(null, { status: 401 }),
      Response.json({ ok: false, description: "private-provider-response" }),
      Response.json({ ok: true, result: { message_id: 0 } }),
      Response.json({ ok: true, result: { message_id: "bad" } }),
    ])
      await assert.rejects(
        sendReleaseNotification(config, ["--changelog", file], async () => reply),
      );
    await assert.rejects(
      sendReleaseNotification(config, ["--changelog", file, "--max-length", "bad"]),
    );
    const invalid = spawnSync(process.execPath, ["scripts/release/telegram-notify.mjs"], {
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: "fake-private-token",
        TELEGRAM_CHAT_ID: "-100123",
      },
      encoding: "utf8",
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /notification failed/);
    assert(!invalid.stderr.includes("fake-private-token"));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
