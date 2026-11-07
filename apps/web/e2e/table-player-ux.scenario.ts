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
    await expect(
      waiting.getByText(it ? "Nessun utente in lista d'attesa" : "No players waiting", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(waiting.getByRole("list")).toHaveCount(0);
    await expect(waiting.getByRole("button")).toHaveCount(1); // Dedicated help, no queue action.
    await page.goto(full);
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
          ? "I giocatori accettati in attesa possono votare. Gli inviti in sospeso non votano e non contano per l'accordo."
          : "Accepted waiting players may vote. Pending invitations do not vote or count toward agreement.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(confirmed);
    await expect(main.getByText(username, { exact: true }).first()).toBeVisible();
    await expect(main.getByText(playerEmail, { exact: true })).toHaveCount(0);
    await page.goto("/profile");
    await main.getByRole("tab", { name: it ? "Giocatore" : "Player", exact: true }).click();
    await expect(main.getByText(it ? "% di vittorie" : "Win %", { exact: true })).toBeVisible();
    // Existing valid owned PLANNING Event; inspect draft only, never save.
    await page.goto(`${free.split("/tables/")[0]}/edit`);
    await main.getByRole("button", { name: it ? "Avanti" : "Next", exact: true }).click();
    await expect(
      main.getByRole("textbox", { name: it ? "Nome tavolo" : "Table name", exact: true }).first(),
    ).toBeVisible();
    const counts = main
      .getByRole("group", { name: it ? "Numero giocatori" : "Number of players", exact: true })
      .first();
    await expect(counts).toBeVisible();
    await expect(counts.getByRole("button")).toHaveCount(5); // Four bounded counters plus one help.
    await counts.getByRole("button", { name: /Field help|Guida al campo/ }).click();
    await expect(
      page.getByText(
        it
          ? "Scegli il minimo a sinistra e il massimo a destra. Servono almeno due giocatori e il minimo non può superare il massimo."
          : "Choose the minimum on the left and maximum on the right. At least two players are required, and the minimum cannot exceed the maximum.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(await main.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });
