import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`public Site navigation and artwork at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Più partite.*Meno incastri/);
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    const webOrigin = process.env.NEXT_PUBLIC_BGO_WEB_ORIGIN ?? "https://board-game-organizer.com";
    await expect(page.getByRole("link", { name: "Apri l’app Web" })).toHaveAttribute(
      "href",
      new URL("/sign-in", webOrigin).href,
    );
    await expect(page.getByRole("link", { name: "Scarica APK" })).toHaveAttribute(
      "href",
      /github.com\/BGOrganizer\/board-game-organizer\/releases\/latest$/,
    );
    await expect(page.getByRole("link", { name: "Powered by BoardGameGeek" })).toHaveAttribute(
      "href",
      "https://boardgamegeek.com/",
    );
    await expect(page.getByRole("link", { name: "Hegemony" })).toHaveAttribute(
      "href",
      /boardgamegeek.com\/boardgame\/321608\//,
    );
    await expect(page.getByRole("button", { name: "Metti in pausa le animazioni" })).toBeHidden();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "Metti in pausa le animazioni" }).click();
    await expect(page.getByRole("button", { name: "Attiva le animazioni" })).toBeVisible();
    await expect(page.locator(".resource-preview picture source")).toHaveCount(0);
    await page.getByRole("button", { name: "Attiva le animazioni" }).click();
    await expect(page.locator(".resource-preview picture source")).toHaveCount(4);

    for (const [label, details] of [
      ["Luogo", "Ludoteca di quartiere"],
      ["Data e ora", /Ven 18 dic.*20:30/],
      ["Gioco scelto", "Azul"],
      ["Evento pubblico", /senza far parte del gruppo/],
      ["Evento privato", /membri accettati/],
    ] as const) {
      await page.getByRole("button", { name: label, exact: true }).click();
      const popover = page.getByRole("dialog", { name: label });
      await expect(popover).toContainText(details);
      if (label === "Gioco scelto") {
        await expect(popover.getByRole("link", { name: /Azul/ })).toHaveAttribute(
          "href",
          /boardgamegeek.com\/boardgame\/230802\//,
        );
      }
      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();
    }

    await page.getByRole("tab", { name: "Rating globale" }).click();
    await expect(
      page.getByRole("img", { name: "Progresso personale · Rating globale · Hegemony" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Switch to English" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/More games.*Less juggling/);
    await page.getByRole("link", { name: "Passa all’italiano" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    expect(pageErrors).toEqual([]);
  });
}
