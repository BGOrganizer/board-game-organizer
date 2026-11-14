import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Locator, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real user badge acceptance`);
  return value;
}
const locale = required("BADGE_LOCALE");
if (!["en", "it"].includes(locale)) throw new Error("BADGE_LOCALE must be en or it");
const italian = locale === "it",
  email = required("E2E_EMAIL");
const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000");
if (
  (!["localhost", "127.0.0.1"].includes(origin.hostname) &&
    !origin.hostname.endsWith(".vercel.app")) ||
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Use local/Preview fixtures and Development Clerk keys only");
const group = required("BADGE_GROUP_PATH"),
  table = required("BADGE_TABLE_PATH");
if (
  !/^\/groups\/[\da-f-]{36}$/.test(group) ||
  !/^\/events\/[\da-f-]{36}\/tables\/[\da-f-]{36}$/.test(table)
)
  throw new Error("Use owned Group and PLANNING Table paths");
const relationshipLabel = required("BADGE_RELATIONSHIP_LABEL"),
  roleLabel = required("BADGE_ROLE_LABEL");

async function badgePresentation(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const chip = control.locator('[data-slot="chip"]');
  await expect(chip).toHaveCSS("width", "22px");
  await expect(chip).toHaveCSS("height", "22px");
  await expect(chip.locator("svg").first()).toHaveCSS("width", "13px");
  const appearance = await chip.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Color geometry unavailable");
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const avatarScope = element.closest(".isolate");
    const avatar = avatarScope?.querySelector(".avatar");
    const overlay = avatarScope
      ? Array.from(avatarScope.children).find(
          (child) => child !== avatar && child.contains(element),
        )
      : undefined;
    const icon = element.querySelector("svg");
    if (!avatar || !overlay || !icon) throw new Error("Expected badge attached to a user avatar");
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    return {
      background: style.backgroundColor,
      alpha: context.getImageData(0, 0, 1, 1).data[3],
      foreground: getComputedStyle(icon).color,
      avatarLayer: Number(getComputedStyle(avatar).zIndex),
      badgeLayer: Number(getComputedStyle(overlay).zIndex),
      badgePosition: getComputedStyle(overlay).position,
      hit: hit !== null && (element.contains(hit) || hit.contains(element)),
    };
  });
  expect(appearance.alpha).toBe(255);
  expect(appearance.avatarLayer).toBe(0);
  expect(appearance.badgeLayer).toBe(20);
  expect(appearance.badgeLayer).toBeGreaterThan(appearance.avatarLayer);
  expect(appearance.badgePosition).toBe("absolute");
  expect(appearance.hit).toBe(true);
  return appearance;
}

// Provisioned records only. Inspect roles/relationships and discard local lock changes.
for (const width of [390, 1280])
  test(`avatar badge explanations and local locks ${locale}/${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    await page.goto("/contacts");
    const contactBadge = page.getByRole("button", { name: relationshipLabel, exact: true }).first();
    await badgePresentation(contactBadge);
    await contactBadge.click();
    await expect(page.getByRole("dialog")).toContainText(
      required("BADGE_RELATIONSHIP_EXPLANATION"),
    );
    await page.keyboard.press("Escape");
    await page.goto(group);
    await page.getByRole("tab", { name: italian ? "Membri" : "Members", exact: true }).click();
    const groupBadge = page
      .getByRole("button", { name: required("BADGE_GROUP_ROLE_LABEL"), exact: true })
      .first();
    await badgePresentation(groupBadge);
    await groupBadge.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(table.split("/tables/")[0]);
    await page
      .getByRole("tab", { name: italian ? "Partecipanti" : "Participants", exact: true })
      .click();
    const roleBadge = page.getByRole("button", { name: roleLabel, exact: true }).first();
    await badgePresentation(roleBadge);
    await expect(roleBadge.locator(".lucide-plus")).toBeVisible();
    const glyph = roleBadge.locator('[data-slot="chip"]');
    const visual = await glyph.boundingBox();
    expect(visual?.width).toBe(22);
    expect(visual?.height).toBe(22);
    await roleBadge.click();
    await expect(
      page.getByRole("dialog", {
        name: italian ? "Ruoli e partecipazione" : "Roles and participation",
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(table);
    await page
      .getByRole("tab", { name: italian ? "Partecipanti" : "Participants", exact: true })
      .click();
    await page
      .getByRole("button", { name: italian ? "Riordina posti" : "Reorder seats", exact: true })
      .click();
    const lock = page
      .getByRole("button", { name: italian ? "Blocca giocatore" : "Lock player", exact: true })
      .first();
    const row = lock.locator("xpath=ancestor::*[@data-seat-order-row][1]");
    const unlockedAppearance = await badgePresentation(lock);
    const bottom = row
      .getByRole("button", { name: /Confirmed player|Giocatore confermato/ })
      .first();
    const upperBox = await lock.boundingBox(),
      lowerBox = await bottom.boundingBox();
    expect(upperBox?.width).toBeGreaterThanOrEqual(44);
    expect(upperBox?.height).toBeGreaterThanOrEqual(44);
    expect(upperBox && lowerBox && upperBox.y + upperBox.height <= lowerBox.y).toBe(true);
    await lock.click();
    const unlock = row.getByRole("button", {
      name: italian ? "Sblocca giocatore" : "Unlock player",
      exact: true,
    });
    await expect(unlock).toBeVisible();
    const lockedAppearance = await badgePresentation(unlock);
    expect(lockedAppearance.background).toBe(unlockedAppearance.background);
    expect(lockedAppearance.foreground).not.toBe(unlockedAppearance.foreground);
    await page
      .getByRole("button", {
        name: italian ? "Scarta ordine non salvato" : "Discard unsaved order",
        exact: true,
      })
      .click();
    await expect(
      row.getByRole("button", { name: italian ? "Blocca giocatore" : "Lock player", exact: true }),
    ).toBeVisible();
  });
