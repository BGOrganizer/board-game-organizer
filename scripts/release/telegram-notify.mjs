#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { telegramMessage } from "./telegram-format.mjs";

export async function sendReleaseNotification(
  env = process.env,
  args = process.argv.slice(2),
  request = fetch,
) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)
    throw new Error("Telegram bot and channel configuration required");
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index < 0 ? undefined : args[index + 1];
  };
  const changelog = option("changelog");
  if (!changelog) throw new Error("Release changelog required");
  const text = telegramMessage(
    {
      repository: env.GITHUB_REPOSITORY,
      environment: env.APP_ENVIRONMENT,
      version: env.APP_VERSION,
      number: env.PR_NUMBER || undefined,
      releaseUrl: env.RELEASE_URL,
      apkUrl: env.APK_URL,
      webUrl: env.WEB_URL,
      notes: readFileSync(changelog, "utf8"),
    },
    Number(option("max-length") ?? 3500),
  );
  const response = await request(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
  if (!response.ok) throw new Error(`Telegram notification failed (${response.status})`);
  const receipt = await response.json();
  if (
    !receipt.ok ||
    !Number.isSafeInteger(receipt.result?.message_id) ||
    receipt.result.message_id < 1
  )
    throw new Error("Telegram notification was not accepted");
  console.log(`Telegram message sent (id ${receipt.result.message_id}, ${text.length} chars)`);
  return receipt.result.message_id;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await sendReleaseNotification();
  } catch {
    console.error(
      "Release notification failed; verify the release metadata and Telegram configuration.",
    );
    process.exitCode = 1;
  }
}
