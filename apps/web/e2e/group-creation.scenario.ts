import { statSync } from "node:fs";
import { resolve } from "node:path";
import { nameDictionaries } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned Group creation acceptance`);
  return value;
}
if (
  required("GROUP_CREATE_FIXTURE_ACK") !== "owned-friends-and-photo" ||
  required("GROUP_CREATE_WRITE_ACK") !== "stage-owned-logo-only"
)
  throw new Error(
    "Owned Development friendship/photo fixtures and explicit logo-staging acknowledgment required; no Group creation or provisioning",
  );
const locale = required("GROUP_CREATE_LOCALE"),
  theme = required("GROUP_CREATE_THEME"),
  api = new URL(required("GROUP_CREATE_API_URL"));
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))]) {
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (!["localhost", "127.0.0.1"].includes(url.hostname) &&
      !(url.protocol === "https:" && url.hostname.endsWith(".vercel.app")))
  )
    throw new Error("Local/Preview only, never Production");
}
if (
  !["en", "it"].includes(locale) ||
  !["light", "dark"].includes(theme) ||
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Explicit EN/IT, light/dark and Development Clerk required");
const friend = required("GROUP_CREATE_FRIEND_NAME"),
  query = required("GROUP_CREATE_FRIEND_QUERY"),
  logoFile = resolve(required("GROUP_CREATE_LOGO_FILE"));
if (
  query.length < 4 ||
  !statSync(logoFile).isFile() ||
  statSync(logoFile).size < 1 ||
  statSync(logoFile).size > 5 * 1024 * 1024
)
  throw new Error("Eligible owned friend query and JPEG/PNG/WebP fixture up to 5 MB required");
const it = locale === "it",
  l = {
    private: it ? "Privato" : "Private",
    public: it ? "Pubblico" : "Public",
    visibility: it ? "Visibilità del gruppo" : "Group visibility",
    help: it ? "Guida al campo" : "Field help",
    legend: it
      ? "I gruppi privati sono solo su invito. I gruppi pubblici sono ricercabili e visibili a tutti gli utenti iscritti dopo l’approvazione."
      : "Private groups are invitation-only. Public groups are searchable and visible to all registered users after approval.",
    name: it ? "Nome del gruppo" : "Group name",
    generate: it ? "Genera un nome casuale" : "Generate a random name",
    location: it ? "Scegli un luogo" : "Choose a location",
    add: it ? "Aggiungi amico" : "Add friend",
    search: it ? "Cerca amici" : "Search friends",
    select: `${it ? "Seleziona utente" : "Select user"}: ${friend}`,
    removeInvite: `${it ? "Rimuovi invito" : "Remove invite"}: ${friend}`,
    upload: it ? "Carica il logo del gruppo" : "Upload group logo",
    change: it ? "Cambia logo" : "Change logo",
    remove: it ? "Rimuovi logo" : "Remove logo",
    logo: it ? "Logo del gruppo" : "Group logo",
    empty: it ? "Nessun logo selezionato" : "No logo selected",
    hint: it ? "JPEG, PNG o WebP, fino a 5 MB." : "JPEG, PNG or WebP, up to 5 MB.",
    create: it ? "Crea gruppo" : "Create group",
    submit: it ? "Invia per approvazione" : "Submit for review",
  };
test(`owned Group creation draft ${locale}/${theme}`, async ({ page }) => {
  await page.setViewportSize({
    width: Number(process.env.GROUP_CREATE_WIDTH ?? 390),
    height: 1000,
  });
  await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await page.goto("/groups/new");
  const errors: string[] = [],
    writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() !== "GET" &&
      request.method() !== "OPTIONS" &&
      /^\/api\/groups(?:\/|$)/.test(path)
    )
      writes.push(path);
  });
  const privateRadio = page.getByRole("radio", { name: l.private, exact: true }),
    publicRadio = page.getByRole("radio", { name: l.public, exact: true });
  await expect(privateRadio).toBeChecked();
  await expect(publicRadio).not.toBeChecked();
  const cards = await page.getByRole("radio").evaluateAll((radios) =>
    radios.map((radio) => {
      const box = radio.closest(".card")!.getBoundingClientRect();
      return { x: box.x, y: box.y };
    }),
  );
  expect(cards).toHaveLength(2);
  expect(cards[0].x).toBeLessThan(cards[1].x);
  expect(Math.abs(cards[0].y - cards[1].y)).toBeLessThan(2);
  await page.getByRole("button", { name: `${l.visibility}: ${l.help}`, exact: true }).click();
  await expect(page.getByText(l.legend, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const name = page.getByRole("textbox", { name: l.name, exact: true });
  await expect(name).toBeEmpty();
  await page.getByRole("button", { name: l.create, exact: true }).click();
  await expect(name).toBeFocused();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: l.generate, exact: true }).click();
  await expect(name).not.toBeEmpty();
  expect(nameDictionaries[it ? "it" : "en"].gruppo).toContain(await name.inputValue());
  expect(writes).toEqual([]);
  await name.fill("Unsaved board club");
  await page.getByRole("button", { name: l.add, exact: true }).click();
  await page.getByRole("textbox", { name: l.search, exact: true }).fill(query);
  await page.getByRole("button", { name: l.select, exact: true }).click();
  await expect(page.getByRole("button", { name: l.removeInvite, exact: true })).toBeVisible();
  await page.getByText(l.private, { exact: true }).click();
  await expect(page.getByRole("button", { name: l.removeInvite, exact: true })).toBeVisible();
  await page.getByText(l.public, { exact: true }).click();
  await expect(publicRadio).toBeChecked();
  await expect(page.getByRole("button", { name: l.removeInvite, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: l.add, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: l.submit, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: l.submit, exact: true }).click();
  await expect(page.getByRole("button", { name: l.upload, exact: true })).toBeFocused();
  expect(writes).toEqual([]);
  await expect(page.getByRole("button", { name: `${l.logo}: ${l.help}`, exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("img", { name: l.empty, exact: true })).toBeVisible();
  await expect(page.getByText(l.hint, { exact: true })).toBeVisible();
  const file = page.locator('input[type="file"]');
  await file.setInputFiles({
    name: "invalid.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("GIF89a"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: l.upload, exact: true })).toBeEnabled();
  const complete = page.waitForResponse(
    (response) =>
      /\/api\/group-assets\/[^/]+\/complete$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST",
  );
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: l.upload, exact: true }).click();
  await (await chooser).setFiles(logoFile);
  const receipt = await complete;
  expect(receipt.status()).toBe(200);
  expect(new URL(receipt.url()).origin).toBe(api.origin);
  await expect(page.getByRole("img", { name: l.logo, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: l.change, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: l.submit, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: l.submit, exact: true }).click();
  await expect(page.getByRole("button", { name: l.location, exact: true })).toBeFocused();
  expect(writes).toEqual([]); // A missing verified venue must not submit a Group.
  const change = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: l.change, exact: true }).click();
  await (await change).setFiles([]);
  await expect(page.getByRole("img", { name: l.logo, exact: true })).toBeVisible();
  await page.getByRole("button", { name: l.remove, exact: true }).click();
  await expect(page.getByRole("img", { name: l.empty, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: l.submit, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: l.submit, exact: true }).click();
  await expect(page.getByRole("button", { name: l.upload, exact: true })).toBeFocused();
  expect(writes).toEqual([]);
  await page.getByText(l.private, { exact: true }).click();
  await expect(privateRadio).toBeChecked();
  await expect(page.getByRole("button", { name: l.removeInvite, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: l.add, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: l.create, exact: true })).toBeEnabled();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({
    path: test.info().outputPath("group-creation-draft.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  // No final submission: stages an owned logo asset only, never creates a Group or invitations.
});
