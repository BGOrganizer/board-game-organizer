import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} required for owned read-only voting-help acceptance`);
  return value;
}
const origin = new URL(required("PLAYWRIGHT_BASE_URL"));
if (
  required("VOTE_HELP_ACK") !== "owned-development-resources" ||
  !["http:", "https:"].includes(origin.protocol) ||
  (!["localhost", "127.0.0.1"].includes(origin.hostname) &&
    !(origin.protocol === "https:" && origin.hostname.endsWith(".vercel.app"))) ||
  origin.username ||
  origin.password ||
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Owned Development fixtures and Clerk only; never Production");
const locale = required("VOTE_HELP_LOCALE");
if (!["en", "it"].includes(locale)) throw new Error("VOTE_HELP_LOCALE must be en or it");
const fixtures = JSON.parse(required("VOTE_HELP_FIXTURES")) as {
  eventId: string;
  tableId: string;
  eventName: string;
  tableName: string;
  multiple: boolean;
  repoll?: boolean;
}[];
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !Array.isArray(fixtures) ||
  (fixtures.length !== 2 && fixtures.length !== 3) ||
  !fixtures.every(
    (f) =>
      f &&
      uuid.test(f.eventId) &&
      uuid.test(f.tableId) &&
      typeof f.multiple === "boolean" &&
      (f.repoll === undefined || (f.repoll === true && !f.multiple)) &&
      [f.eventName, f.tableName].every(
        (name) => typeof name === "string" && name.trim().length > 0 && name.length <= 120,
      ),
  ) ||
  !fixtures.some((f) => f.multiple) ||
  !fixtures.some((f) => !f.multiple && !f.repoll) ||
  (fixtures.length === 3) !== fixtures.some((f) => f.repoll === true)
)
  throw new Error(
    "Provide owned PLANNING single and multiple fixtures, optionally a third changed-singleton fixture with repoll:true",
  );
const it = locale === "it";
const labels = [
  it ? "Date e Orari" : "Dates and times",
  it ? "Luoghi" : "Locations",
  it ? "Giochi da tavolo" : "Board games",
];
const positive = it
  ? 'Scegli almeno un\'opzione "Sì" o "Se necessario" in questa categoria.'
  : 'Choose at least one "Yes" or "If needed" option in this category.';
const revote = it
  ? "Vota di nuovo sull’opzione modificata. Il No ti lascia iscritto e, se hai un posto al tavolo, blocca l’accordo."
  : "Vote again on the changed option. A No keeps you registered and blocks agreement if you have a seat.";
const eventHelp = it
  ? "Puoi votare solo se partecipi ad almeno un tavolo dell'evento con iscrizione accettata."
  : "You can vote only if you are an accepted participant in at least one table in the event.";
const tableHelp = it
  ? "Puoi votare solo se partecipi a questo tavolo con iscrizione accettata."
  : "You can vote only if you are an accepted participant at this table.";
const voteChoices = it ? ["Sì", "Se necessario", "No"] : ["Yes", "If needed", "No"];
const chooseVote = it ? "Scegli il tuo voto" : "Choose your vote";
const showVotes = it ? "Mostra voti" : "Show votes";
const votes = it ? "Voti" : "Votes";

for (const width of [390, 1280])
  test(`category voting help ${locale} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    for (const fixture of fixtures) {
      for (const [index, label] of labels.entries()) {
        await page.goto(
          index === 2
            ? `/events/${fixture.eventId}/tables/${fixture.tableId}`
            : `/events/${fixture.eventId}`,
        );
        await expect(
          page.getByRole("heading", {
            name: index === 2 ? fixture.tableName : fixture.eventName,
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
        const details = it ? "Dettagli" : "Details";
        await expect(page.getByRole("heading", { name: details, exact: true })).toBeVisible();
        const categoryTrigger = page.getByRole("button", {
          name: `${label}: ${it ? "Legenda voti" : "Voting legend"}`,
          exact: true,
        });
        const detailsTrigger = page.getByRole("button", {
          name:
            index === 2
              ? it
                ? "Aiuto sui dettagli del tavolo"
                : "Table details help"
              : it
                ? "Aiuto sui dettagli dell’evento"
                : "Event details help",
          exact: true,
        });
        const popup = page.getByRole("dialog");
        if (index === 0) {
          await detailsTrigger.click();
          await expect(popup.getByText(eventHelp, { exact: true })).toHaveCount(
            fixture.multiple || fixture.repoll ? 1 : 0,
          );
          if (fixture.multiple)
            await expect(
              popup.getByText(
                it
                  ? 'Scegli almeno un’opzione "Sì" o "Se necessario" per ogni categoria.'
                  : 'Choose at least one "Yes" or "If needed" option in each category.',
                { exact: true },
              ),
            ).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(popup).toHaveCount(0);
        }
        if (index === 2) {
          await expect(categoryTrigger).toHaveCount(0);
          const participants = it ? "Partecipanti" : "Participants";
          await page.getByRole("tab", { name: participants, exact: true }).click();
          await expect(
            page.getByRole("heading", { name: participants, exact: true }),
          ).toBeVisible();
          await page
            .getByRole("button", {
              name: it ? "Aiuto sui partecipanti al tavolo" : "Table participants help",
              exact: true,
            })
            .click();
          await expect(
            popup.getByText(
              it
                ? "Se tutti i posti sono occupati, i nuovi giocatori entrano in lista d’attesa."
                : "If all seats are taken, new players join the waiting list.",
              { exact: true },
            ),
          ).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(popup).toHaveCount(0);
          await page.getByRole("tab", { name: details, exact: true }).click();
        }
        const trigger = index === 2 ? detailsTrigger : categoryTrigger;
        const category = page.getByRole("region", { name: label, exact: true });
        if (fixture.repoll) {
          await trigger.click();
          await expect(popup.getByText(revote, { exact: true })).toBeVisible();
          await expect(popup.getByText(positive, { exact: true })).toHaveCount(0);
          await page.keyboard.press("Escape");
          await expect(popup).toHaveCount(0);
          await category
            .getByRole("button", {
              name: new RegExp(`: (${[chooseVote, ...voteChoices].join("|")})$`),
            })
            .click();
          const ballot = page.getByRole("dialog", { name: chooseVote, exact: true });
          await expect(ballot.getByRole("button", { name: "No", exact: true })).toBeEnabled();
          await page.keyboard.press("Escape");
          await expect(ballot).toHaveCount(0);
          continue;
        }
        const voteAction = category
          .getByRole("button", {
            name: new RegExp(`: (${[showVotes, chooseVote, ...voteChoices].join("|")})$`),
          })
          .first();
        if (!fixture.multiple) {
          if (index === 2) {
            await trigger.click();
            await expect(popup.getByText(tableHelp, { exact: true })).toHaveCount(0);
            await page.keyboard.press("Escape");
            await expect(popup).toHaveCount(0);
          } else {
            await expect(trigger).toHaveCount(0);
          }
          await expect(voteAction).toHaveCount(0);
          continue;
        }
        await trigger.click();
        const popover = page.getByRole("dialog");
        await expect(
          popover.getByText(index === 2 ? tableHelp : eventHelp, { exact: true }),
        ).toBeVisible();
        await expect(popover.getByText(positive, { exact: true })).toBeVisible();
        for (const vote of voteChoices)
          await expect(popover.getByText(vote, { exact: true })).toBeVisible();
        await expect(
          popover.getByText(it ? "Guida al campo" : "Field help", { exact: true }),
        ).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(popover).toHaveCount(0);
        await expect(voteAction).toBeVisible();
        const opensVotesDirectly = (await voteAction.getAttribute("aria-label"))?.endsWith(
          `: ${showVotes}`,
        );
        await voteAction.click();
        if (!opensVotesDirectly)
          await page
            .getByRole("dialog", { name: chooseVote, exact: true })
            .getByRole("button", { name: showVotes, exact: true })
            .click();
        const sheet = page.getByRole("dialog", { name: votes, exact: true });
        for (const choice of voteChoices) {
          await sheet.getByRole("tab", { name: choice, exact: true }).click();
          await expect(sheet.getByRole("tabpanel", { name: choice, exact: true })).toBeVisible();
        }
        await sheet.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).click();
        await expect(sheet).toHaveCount(0);
      }
    }
  });
