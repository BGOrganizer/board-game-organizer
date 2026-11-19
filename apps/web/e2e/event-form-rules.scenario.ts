import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { enterDateTime } from "./date-time";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned Event form acceptance`);
  return value;
}
const origin = new URL(required("PLAYWRIGHT_BASE_URL"));
const locale = required("FORM_RULES_LOCALE");
const group = required("FORM_RULES_PUBLIC_GROUP");
if (
  required("FORM_RULES_ACK") !== "owned-development-groups" ||
  !["en", "it"].includes(locale) ||
  group.length < 5 ||
  group.length > 120 ||
  !["http:", "https:"].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  (!["localhost", "127.0.0.1"].includes(origin.hostname) &&
    !(origin.protocol === "https:" && origin.hostname.endsWith(".vercel.app"))) ||
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error(
    "Owned Development only; unique approved Public group administered/moderated by this actor required",
  );
// Fresh local creation draft required. Leaves only an unsaved draft; never submits valid data.
const it = locale === "it";
for (const width of [390, 1280])
  test(`Event form name limits and Public eligibility ${locale}/${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const previousUrl = page.url();
    await page.goto("/events/new");
    const back = page.getByRole("button", { name: it ? "Indietro" : "Back", exact: true });
    await expect(back).toBeVisible();
    await expect(back).toHaveText("");
    await expect(back.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await back.click();
    await expect(page).toHaveURL(previousUrl);
    await page.goto("/events/new");
    const name = page.getByRole("textbox", {
      name: it ? "Nome evento" : "Event name",
      exact: true,
    });
    await expect(name).toBeEmpty();
    await expect(name).toHaveAttribute("minlength", "5");
    await expect(name).toHaveAttribute("maxlength", "30");
    const publicRadio = page.getByRole("radio", { name: it ? "Pubblico" : "Public", exact: true });
    await expect(publicRadio).toBeDisabled();
    await expect(
      page.getByText(it ? "Non disponibile" : "Unavailable", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: it ? "Visibilità dell’evento: Guida al campo" : "Event visibility: Field help",
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(
          it
            ? "Gli eventi pubblici sono visibili a tutti e puoi partecipare senza essere membro del gruppo. Seleziona un gruppo pubblico approvato per abilitare questa opzione."
            : "Public events are visible to everyone and can be joined without group membership. Select an approved public group to enable this option.",
          { exact: true },
        ),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await name.fill("abcd");
    await page.getByRole("button", { name: it ? "Avanti" : "Next", exact: true }).click();
    await expect(
      page.getByText(
        it
          ? "Inserisci un nome per l'evento da 5 a 30 caratteri."
          : "Enter an event name between 5 and 30 characters.",
        { exact: true },
      ),
    ).toBeVisible();
    await name.fill("");
    await name.pressSequentially("a".repeat(31));
    expect((await name.inputValue()).length).toBe(30);
    await page.getByRole("button", { name: new RegExp(`${it ? "Gruppo" : "Group"}$`) }).click();
    const popover = page.getByRole("listbox");
    await page.getByPlaceholder(it ? "Cerca gruppi" : "Search groups", { exact: true }).fill(group);
    const option = popover.getByRole("option", { name: group, exact: true });
    await expect(option).toBeVisible();
    await expect(
      popover.getByRole("img", {
        name: it ? "Amministratore del gruppo" : "Group admin",
        exact: true,
      }),
    ).toHaveCount(0);
    await option.click();
    await expect(publicRadio).toBeEnabled();
    await publicRadio.click();
    await expect(publicRadio).toBeChecked();

    const start = page.getByRole("group", {
      name: it ? /^Data e orario/ : /^Date and time/,
    });
    await expect(start.getByRole("spinbutton")).toHaveCount(5);
    await enterDateTime(start, "2030-06-12T14:00");
    await start
      .getByRole("button", {
        name: it ? "Scegli data e ora" : "Choose date and time",
        exact: true,
      })
      .click();
    const picker = page.getByRole("dialog", {
      name: it ? "Scegli data e ora" : "Choose date and time",
      exact: true,
    });
    await expect(picker.getByRole("grid")).toBeVisible();
    await picker.getByRole("grid").getByText("13", { exact: true }).click();
    await expect(picker).toBeVisible();
    await enterDateTime(
      picker.getByRole("group", { name: it ? "Ora" : "Time", exact: true }),
      "14:30",
    );
    const done = picker.getByRole("button", { name: it ? "Fine" : "Done", exact: true });
    await expect(done).toHaveText(it ? "Fine" : "Done");
    await expect(picker.getByText("DPfwMq", { exact: true })).toHaveCount(0);
    await done.click();
    await expect(picker).toHaveCount(0);
    await expect(start.locator('[role="spinbutton"][data-type="day"]')).toHaveAttribute(
      "aria-valuenow",
      "13",
    );
    await expect(start.locator('[role="spinbutton"][data-type="hour"]')).toHaveAttribute(
      "aria-valuenow",
      "14",
    );
    await expect(start.locator('[role="spinbutton"][data-type="minute"]')).toHaveAttribute(
      "aria-valuenow",
      "30",
    );
    const end = page.getByRole("group", {
      name: it ? /^Ora di fine/ : /^End time/,
    });
    await expect(end.getByRole("spinbutton")).toHaveCount(2);
    await enterDateTime(end, "18:00");
    // The entire journey leaves an unsaved draft; no event creation or provider writes.
  });
