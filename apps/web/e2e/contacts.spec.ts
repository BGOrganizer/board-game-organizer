import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * Social contacts E2E (Playwright, web preview).
 *
 * Requires TWO provisioned users: the actor (E2E_EMAIL, signed in here) and
 * the social target (E2E_EMAIL_2, found via search / followed / blocked).
 * The target is mirrored into the shared users collection by the Clerk
 * user.created webhook before the suite runs; the search step polls with a
 * long timeout to tolerate webhook delivery latency.
 */
const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const E2E_EMAIL_2 = process.env.E2E_EMAIL_2 ?? "";

async function signInAsActor(page: import("@playwright/test").Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/");
  await page.waitForURL("**/matches", { timeout: 60_000 });
  await expect(page.getByText("Counter (Zustand)")).toBeVisible({ timeout: 60_000 });
}

test("contacts: search, follow/unfollow, block/unblock the social target", async ({ page }) => {
  test.setTimeout(240_000);
  test.skip(!E2E_EMAIL || !E2E_EMAIL_2, "E2E users not set (CI provisions them)");

  await signInAsActor(page);
  await page.goto("/contacts");
  // Reload after the first paint: the Contacts tab captures its session
  // token on mount (getToken at effect time) — a reload guarantees a fresh
  // token before the first search, otherwise the search can 401 (stale
  // short-lived JWT) and the UI masks the failure as "No users found".
  await page.reload();
  await page.getByRole("button", { name: "Search" }).click();
  const searchInput = page.getByRole("textbox", { name: /search users by name or email/i });
  await expect(searchInput).toBeVisible();
  await searchInput.fill(E2E_EMAIL_2);

  // The target row appears once the webhook mirroring lands (poll).
  try {
    await expect(page.getByText("E2E Target").first()).toBeVisible({
      timeout: 90_000,
    });
  } catch (e) {
    // Debug: log the REAL search API response (status + body) so a failed
    // run shows whether the API returned [] (doc missing / DB mismatch) or
    // an error (401/429/500) that the UI masks as "No users found".
    const debug = await page.evaluate(async (q) => {
      try {
        const clerk = (window as any).Clerk ?? (window as any).__clerk_loaded;
        const t = (await clerk?.session?.getToken?.()) ?? null;
        const r = await fetch(
          `https://api.board-game-organizer.com/api/users/search?query=${encodeURIComponent(q)}`,
          { headers: t ? { Authorization: `Bearer ${t}` } : {} },
        );
        return { status: r.status, body: (await r.text()).slice(0, 500), hasToken: Boolean(t) };
      } catch (err) {
        return { error: String(err) };
      }
    }, E2E_EMAIL_2);
    console.log("SEARCH-DEBUG", JSON.stringify(debug));
    throw e;
  }

  // -- Follow → button flips to Unfollow.
  await page.getByRole("button", { name: "Follow", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Unfollow", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  // -- Unfollow → back to Follow.
  await page.getByRole("button", { name: "Unfollow", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Follow", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  // -- Follow again (so blocking also removes the follow).
  await page.getByRole("button", { name: "Follow", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Unfollow", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  // -- Block via the kebab menu + confirmation dialog.
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: /block/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Block", exact: true }).click();

  // Blocked user disappears from search results.
  await expect(page.getByText("E2E Target").first()).toBeHidden({ timeout: 30_000 });

  // -- Blocked tab lists the target; unblock brings them back.
  await page.getByRole("button", { name: "Blocked" }).click();
  await expect(page.getByText("E2E Target").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: /unblock/i }).click();
  await expect(page.getByText("No blocked users")).toBeVisible({ timeout: 30_000 });

  // Back to search: the target is findable again.
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("E2E Target").first()).toBeVisible({ timeout: 30_000 });
});
