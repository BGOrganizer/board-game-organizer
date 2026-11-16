import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real Table/player UX acceptance`);
  return value;
}
const locale = required("TABLE_UX_LOCALE"),
  email = required("E2E_EMAIL"),
  username = required("TABLE_UX_USERNAME"),
  playerEmail = required("TABLE_UX_EMAIL");
if (!["en", "it"].includes(locale)) throw new Error("TABLE_UX_LOCALE must be en or it");
const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000");
if (
  !["localhost", "127.0.0.1"].includes(origin.hostname) &&
  !origin.hostname.endsWith(".vercel.app")
)
  throw new Error("Use local/Preview fixtures, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Use Development Clerk keys only");
function path(kind: string) {
  const value = required(`TABLE_UX_${kind}_PATH`);
  if (!/^\/events\/[\da-f-]{36}\/tables\/[\da-f-]{36}$/.test(value))
    throw new Error(`Invalid TABLE_UX_${kind}_PATH`);
  return value;
}
const free = path("FREE"),
  full = path("FULL"),
  confirmed = path("CONFIRMED"),
  it = locale === "it";
for (const width of [390, 1280])
  test(`real Table/player labels and waiting states ${locale}/${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const main = page.getByRole("main"),
      waiting = main.getByRole("region", {
        name: it ? "Lista d'attesa" : "Waiting list",
        exact: true,
      });
    await page.goto(free);
    await main
      .getByRole("tab", { name: it ? "Partecipanti" : "Participants", exact: true })
      .click();
    await expect(
      waiting.getByText(it ? "Nessun utente in lista d'attesa" : "No players waiting", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(waiting.getByRole("list")).toHaveCount(0);
    await expect(waiting.getByRole("button")).toHaveCount(1); // Dedicated help, no queue action.
    await main
      .getByRole("button", {
        name: it ? "Lista posti: Guida al campo" : "Seats list: Field help",
        exact: true,
      })
      .click();
    const seatsHelp = page.getByRole("dialog");
    for (const label of it
      ? [
          "Giocatore accettato",
          "Invito in attesa",
          "Gli inviti in attesa non contano per l'accordo.",
        ]
      : [
          "Accepted player",
          "Invitation pending",
          "Pending invitations do not count toward agreement.",
        ])
      await expect(seatsHelp.getByText(label, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(full);
    await main
      .getByRole("tab", { name: it ? "Partecipanti" : "Participants", exact: true })
      .click();
    await expect(
      waiting.getByRole("button", {
        name: it ? "Mettiti in coda" : "Join waiting list",
        exact: true,
      }),
    ).toBeVisible();
    await waiting.getByRole("button", { name: /Field help|Guida al campo/ }).click();
    await expect(
      page.getByText(
        it
          ? "I giocatori accettati in lista d'attesa possono votare. Possono partecipare se l'amministratore o l'app li seleziona secondo le regole del tavolo."
          : "Accepted players on the waiting list can vote. They may play if an administrator or the app selects them according to the table's rules.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(full.split("/tables/")[0]);
    const tablesTab = main.getByRole("tab", { name: it ? "Tavoli" : "Tables", exact: true });
    await tablesTab.click();
    await expect(tablesTab).toHaveAttribute("aria-selected", "true");
    await expect(
      main.getByRole("heading", { name: it ? "Lista tavoli" : "Table list", exact: true }),
    ).toHaveCount(0);
    await expect(
      main.getByRole("button", { name: it ? "Legenda tavoli" : "Table legend", exact: true }),
    ).toHaveCount(0);
    await page.goto(confirmed);
    await main
      .getByRole("tab", { name: it ? "Partecipanti" : "Participants", exact: true })
      .click();
    await expect(main.getByText(username, { exact: true }).first()).toBeVisible();
    await expect(main.getByText(playerEmail, { exact: true })).toHaveCount(0);
    await page.goto("/profile");
    await main.getByRole("tab", { name: it ? "Giocatore" : "Player", exact: true }).click();
    await expect(main.getByText(it ? "% di vittorie" : "Win %", { exact: true })).toBeVisible();
    // Existing valid owned PLANNING Event; inspect draft only, never save.
    await page.goto(`${free.split("/tables/")[0]}/edit`);
    await expect(
      main.getByRole("textbox", { name: it ? "Nome evento" : "Event name", exact: true }),
    ).toHaveAttribute("maxlength", "30");
    await main.getByRole("button", { name: it ? "Avanti" : "Next", exact: true }).click();
    await main.getByRole("button", { name: it ? "Avanti" : "Next", exact: true }).click();
    await main.getByTestId(`event-draft-table-${free.split("/tables/")[1]}`).click();
    await expect(
      main.getByRole("textbox", { name: it ? "Nome tavolo" : "Table name", exact: true }).first(),
    ).toBeVisible();
    await expect(
      main.getByRole("textbox", { name: it ? "Nome tavolo" : "Table name", exact: true }).first(),
    ).toHaveAttribute("maxlength", "30");
    await main
      .getByRole("button", {
        name: it ? "Nome tavolo: Guida al campo" : "Table name: Field help",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        it
          ? "Scegli un nome riconoscibile per il tavolo, da 5 a 30 caratteri."
          : "Name this table so players can recognize it. Use between 5 and 30 characters.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const counts = main
      .getByRole("group", { name: it ? "Numero giocatori" : "Number of players", exact: true })
      .first();
    await expect(counts).toBeVisible();
    await expect(counts.getByRole("button")).toHaveCount(5); // Four bounded counters plus one help.
    await counts.getByRole("button", { name: /Field help|Guida al campo/ }).click();
    await expect(
      page.getByText(
        it
          ? "Scegli il numero minimo e massimo di giocatori. L'intervallo è limitato dai giochi scelti, secondo i dati di BGG."
          : "Choose the minimum and maximum number of players. The range is limited by the selected games according to BGG data.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(await main.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });
