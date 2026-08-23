#!/usr/bin/env node
// Sends a release notification to the Telegram channel via the Bot API.
//
// Usage:
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... \
//   node scripts/release/telegram-notify.mjs \
//     --title "🚀 Board Game Organizer v1.1.0" \
//     --changelog /tmp/changelog.md \
//     --links-file /tmp/links.html \
//     [--max-length 3500]
//
// The message is composed as HTML (Telegram parse_mode=HTML): markdown
// headers/bullets from the changelog are converted, content is HTML-escaped
// and truncated to stay under Telegram's 4096-char limit. The links file is
// inserted as-is (it is already HTML).
import { readFileSync } from "node:fs";

// biome-ignore lint/suspicious/noUndeclaredEnvVars: set by CI secrets
const token = process.env.TELEGRAM_BOT_TOKEN;
// biome-ignore lint/suspicious/noUndeclaredEnvVars: set by CI secrets
const chatId = process.env.TELEGRAM_CHAT_ID;
if (!token || !chatId) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables are required");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const title = getArg("title") ?? "";
const changelogFile = getArg("changelog");
const linksFile = getArg("links-file");
const maxLength = Number(getArg("max-length") ?? 3500);

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function mdToHtml(md) {
  return md
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      const header = trimmed.match(/^#{2,4}\s+(.*)/);
      if (header) return `<b>${escapeHtml(header[1])}</b>`;
      const bullet = trimmed.match(/^[-*]\s+(.*)/);
      if (bullet) return `• ${escapeHtml(bullet[1])}`;
      const bold = trimmed.match(/^\*\*(.*)\*\*$/);
      if (bold) return `<b>${escapeHtml(bold[1])}</b>`;
      return escapeHtml(trimmed);
    })
    .filter(Boolean)
    .join("\n");
}

let changelog = "";
if (changelogFile) {
  changelog = mdToHtml(readFileSync(changelogFile, "utf8"));
}
const links = linksFile ? readFileSync(linksFile, "utf8") : "";

let text = [title, changelog, links].filter(Boolean).join("\n\n");
if (text.length > maxLength) {
  // Truncate on a line boundary: each mdToHtml line is self-contained HTML,
  // so slicing mid-line could leave an unclosed tag and Telegram rejects it
  // ("can't parse entities: Unclosed start tag").
  const lines = text.split("\n");
  let acc = "";
  for (const line of lines) {
    if (acc.length + line.length + (acc ? 1 : 0) > maxLength) break;
    acc = acc ? `${acc}\n${line}` : line;
  }
  text = `${acc}\n…`;
}

const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }),
});

const json = await res.json();
if (!json.ok) {
  console.error("Telegram error:", JSON.stringify(json));
  process.exit(1);
}
console.log(`Telegram message sent (id ${json.result.message_id}, ${text.length} chars)`);
