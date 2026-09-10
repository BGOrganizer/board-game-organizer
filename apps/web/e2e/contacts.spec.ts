import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

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
const E2E_PHONE_2 = process.env.E2E_PHONE_2 ?? "";

async function signIn(page: import("@playwright/test").Page, emailAddress: string) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await expect(page.getByText("Matches")).toBeVisible({ timeout: 60_000 });
}

async function findTarget(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Search" }).click();
  const searchInput = page.getByRole("textbox", { name: /search users by name or email/i });
  await expect(searchInput).toBeVisible();
  await searchInput.fill(E2E_EMAIL_2);
  await expect(page.getByText("E2E Target").first()).toBeVisible({ timeout: 90_000 });
}

async function sendFriendRequest(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "Send friend request" }).click();
  const dialog = page.getByRole("dialog", { name: "Send friend request?" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const request = page.waitForRequest(
    (candidate) => candidate.method() === "POST" && candidate.url().includes("type=friend_request"),
  );
  await dialog.getByRole("button", { name: "Send request" }).click();
  await request;
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("contacts: friend lifecycle, follow/unfollow, block/unblock", async ({ page, browser }) => {
  test.setTimeout(420_000);
  test.skip(!E2E_EMAIL || !E2E_EMAIL_2 || !E2E_PHONE_2, "E2E users not set (CI provisions them)");

  await signIn(page, E2E_EMAIL);
  const suggestionsRequestPromise = page.waitForRequest((request) =>
    request.url().includes("/api/users/suggestions"),
  );
  await page.goto("/contacts");

  // Wait until the Clerk client has an active session in THIS page context.
  // The Contacts tab captures its token on mount and the search calls
  // getToken() — if the client is still booting, getToken() resolves null,
  // resolveToken throws, and the UI silently shows "No users found"
  // (no API call is ever made, which the UI masks as an empty result).
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.session), null, {
    timeout: 60_000,
  });

  // Simulate a mobile address-book sync with phone only, then verify the
  // persisted suggestion is visible from the web client.
  const suggestionsRequest = await suggestionsRequestPromise;
  const syncUrl = new URL(suggestionsRequest.url());
  syncUrl.pathname = "/api/contacts/sync";
  const token = await page.evaluate(() => {
    const clerk = Reflect.get(window, "Clerk");
    if (!clerk?.session) throw new Error("Clerk session unavailable");
    return clerk.session.getToken();
  });
  if (!token) throw new Error("Clerk token unavailable");
  await page.evaluate(
    async ({ phone, token, url }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumbers: [phone] }),
      });
      if (!response.ok) throw new Error(`Contact sync failed: ${response.status}`);
    },
    { phone: E2E_PHONE_2, token, url: syncUrl.toString() },
  );
  await page.reload();
  await page.getByRole("button", { name: "Suggestions" }).click();
  await expect(page.getByText("E2E Target").first()).toBeVisible({ timeout: 90_000 });

  await findTarget(page);
  await sendFriendRequest(page);
  await page.getByRole("button", { name: "Friend requests" }).click();
  const sent = page.getByRole("heading", { name: "Sent" }).locator("..");
  await expect(sent.getByText("E2E Target")).toBeVisible({ timeout: 30_000 });

  // Outgoing requests can be cancelled from the contextual menu and sent again.
  await sent.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel friend request" }).click();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(sent.getByText("No sent friend requests")).toBeVisible({ timeout: 30_000 });
  await findTarget(page);
  await sendFriendRequest(page);
  await page.getByRole("button", { name: "Friend requests" }).click();
  await expect(sent.getByText("E2E Target")).toBeVisible({ timeout: 30_000 });

  // The target sees both request sections and can reject the incoming request.
  const targetContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const targetPage = await targetContext.newPage();
  await signIn(targetPage, E2E_EMAIL_2);
  await targetPage.goto("/contacts");
  await targetPage.getByRole("button", { name: "Friend requests" }).click();
  const received = targetPage.getByRole("heading", { name: "Received" }).locator("..");
  await expect(received.getByText("E2E Test")).toBeVisible({ timeout: 30_000 });
  await received.getByRole("button", { name: /Respond to friend request/ }).click();
  await targetPage.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(received.getByText("No received friend requests")).toBeVisible({ timeout: 30_000 });

  // A rejected request can be sent again from the contextual action, then accepted.
  await page.reload();
  await findTarget(page);
  await sendFriendRequest(page);
  await targetPage.reload();
  await targetPage.getByRole("button", { name: "Friend requests" }).click();
  const receivedAgain = targetPage.getByRole("heading", { name: "Received" }).locator("..");
  await expect(receivedAgain.getByText("E2E Test")).toBeVisible({ timeout: 30_000 });
  await receivedAgain.getByRole("button", { name: /Respond to friend request/ }).click();
  await targetPage.getByRole("button", { name: "Accept", exact: true }).click();
  await targetPage.getByRole("button", { name: "Friends" }).click();
  await expect(targetPage.getByText("E2E Test")).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await page.getByRole("button", { name: "Friends" }).click();
  await expect(page.getByText("E2E Target")).toBeVisible({ timeout: 30_000 });
  await targetContext.close();

  // One action removes friendship plus the actor's follow and refreshes every list.
  await page.getByRole("button", { name: /Remove friend: E2E Target/ }).click();
  await page.getByRole("button", { name: "Remove friend", exact: true }).click();
  await expect(page.getByText("E2E Target")).toBeHidden({ timeout: 30_000 });
  await findTarget(page);
  await expect(page.getByRole("button", { name: "Follow", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

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
  const dialog = page.getByRole("dialog").last();
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
