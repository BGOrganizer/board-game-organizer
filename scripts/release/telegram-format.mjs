import { changelogContent, releaseTitle, releaseUrl } from "./release-format.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(value) {
  const tokens = /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|^_([^_]+)_$/g;
  let html = "",
    offset = 0;
  for (const match of value.matchAll(tokens)) {
    html += escapeHtml(value.slice(offset, match.index));
    if (match[1]) html += `<code>${escapeHtml(match[1])}</code>`;
    else if (match[2]) html += `<a href="${escapeHtml(match[3])}">${escapeHtml(match[2])}</a>`;
    else if (match[4]) html += `<b>${escapeHtml(match[4])}</b>`;
    else html += `<i>${escapeHtml(match[5])}</i>`;
    offset = match.index + match[0].length;
  }
  return html + escapeHtml(value.slice(offset));
}

export function telegramMessage(input, maxLength = 3500) {
  if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 4096)
    throw new Error("Invalid Telegram message limit");
  if (!/^[\w.-]+\/[\w.-]+$/.test(input.repository ?? ""))
    throw new Error("Invalid notification repository");
  const release = releaseUrl(input.releaseUrl, "github.com");
  const apk = releaseUrl(input.apkUrl, "github.com");
  const root = `/${input.repository}/releases/`;
  if (
    !new URL(release).pathname.startsWith(`${root}tag/`) ||
    !new URL(apk).pathname.startsWith(`${root}download/`) ||
    !new URL(apk).pathname.endsWith(".apk")
  )
    throw new Error("Verified release and direct APK URLs required");
  const links = [
    ...(input.number
      ? [
          `🔀 <a href="https://github.com/${input.repository}/pull/${input.number}">PR #${input.number}</a>`,
        ]
      : []),
    `📱 <a href="${escapeHtml(apk)}">Download APK</a>`,
    `🌐 <a href="${escapeHtml(releaseUrl(input.webUrl))}">Web</a>`,
    `📦 <a href="${escapeHtml(release)}">Release &amp; full changelog</a>`,
  ].join("\n");
  const prefix = `🚀 <b>${escapeHtml(releaseTitle(input))}</b>\n\n${links}\n\n`;
  const sections = [];
  for (const line of changelogContent(input.notes).split("\n")) {
    const text = line.trim();
    if (!text || /^<!--.*-->$/.test(text)) continue;
    const heading = text.match(/^#{2,4}\s+(.*)/);
    if (heading) sections.push({ heading: `<b>${escapeHtml(heading[1])}</b>`, rows: [] });
    else {
      if (!sections.length) sections.push({ heading: "", rows: [] });
      sections.at(-1).rows.push(inline(text.replace(/^[-*]\s+/, "• ")));
    }
  }
  const render = (counts, abbreviated = false) =>
    sections
      .map((section, index) =>
        [
          section.heading,
          ...section.rows.slice(0, counts[index]),
          ...(abbreviated && counts[index] < section.rows.length ? ["<i>…</i>"] : []),
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n");
  const full = prefix + render(sections.map((section) => section.rows.length));
  if (full.length <= maxLength) return full;
  const footer = `\n\n<a href="${escapeHtml(release)}">Read the full changelog</a>`;
  const counts = sections.map(() => 0);
  const abbreviated = () => prefix + render(counts, true) + footer;
  if (abbreviated().length > maxLength) {
    if ((prefix + footer.trimStart()).length > maxLength)
      throw new Error("Release links exceed the Telegram message limit");
    return prefix + footer.trimStart();
  }
  // Share the available space across categories; never cut a commit link or HTML entity.
  let added;
  do {
    added = false;
    for (let index = 0; index < sections.length; index++) {
      if (counts[index] >= sections[index].rows.length) continue;
      counts[index]++;
      if (abbreviated().length <= maxLength) added = true;
      else counts[index]--;
    }
  } while (added);
  return abbreviated();
}
