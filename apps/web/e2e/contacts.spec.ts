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
}

async function findTarget(page: import("@playwright/test").Page) {
  await page.getByRole("tab", { name: "Search" }).click();
  const searchInput = page.getByRole("searchbox", { name: /search users by name or email/i });
  await expect(searchInput).toBeVisible();
  await searchInput.fill(E2E_EMAIL_2);
  await expect(
    page
      .getByRole("heading", { name: "Search results" })
      .locator("xpath=following-sibling::ul[1]")
      .getByText("E2E Target"),
  ).toBeVisible({ timeout: 90_000 });
}

function waitForRelationshipResponse(
  page: import("@playwright/test").Page,
  method: "POST" | "DELETE",
  type: "follow" | "friend_request" | "friend" | "block",
) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === method &&
      url.pathname.endsWith("/api/relationships") &&
      url.searchParams.get("type") === type
    );
  });
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
  const response = waitForRelationshipResponse(page, "POST", "friend_request");
  await dialog.getByRole("button", { name: "Send request" }).click();
  expect((await response).ok()).toBe(true);
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
  await page.getByRole("tab", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: "Device Contacts" })).toBeVisible({
    timeout: 90_000,
  });
  const deviceContacts = page.locator("#device-contacts-title").locator("..");
  await expect(deviceContacts.getByText("E2E Target")).toBeVisible({ timeout: 90_000 });

  await findTarget(page);
  await sendFriendRequest(page);
  await page.getByRole("tab", { name: "Requests" }).click();
  await page.getByRole("button", { name: "Requests: Icon legend" }).click();
  const requestLegend = page.getByRole("dialog");
  await expect(requestLegend.getByText("Requests awaiting your reply.")).toBeVisible();
  await expect(requestLegend.getByText("Requests awaiting their reply.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(requestLegend).toBeHidden();
  const sent = page.getByRole("listitem").filter({ hasText: "E2E Target" });
  await expect(sent.getByRole("img", { name: "Sent" })).toBeVisible({ timeout: 30_000 });

  // Outgoing requests can be cancelled from the contextual menu and sent again.
  await sent.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel friend request" }).click();
  const cancelResponse = waitForRelationshipResponse(page, "DELETE", "friend_request");
  await page.getByRole("button", { name: "Cancel request" }).click();
  expect((await cancelResponse).ok()).toBe(true);
  await expect(page.getByText("No friend requests")).toBeVisible({ timeout: 30_000 });
  await findTarget(page);
  await sendFriendRequest(page);
  await page.getByRole("tab", { name: "Requests" }).click();
  await expect(sent.getByRole("img", { name: "Sent" })).toBeVisible({ timeout: 30_000 });

  // The target sees both request sections and can reject the incoming request.
  const targetContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const targetPage = await targetContext.newPage();
  await signIn(targetPage, E2E_EMAIL_2);
  await targetPage.goto("/contacts");
  await targetPage.getByRole("button", { name: "Notifications" }).click();
  await expect(targetPage.getByText("New friend request").first()).toBeVisible({
    timeout: 30_000,
  });
  await targetPage.getByText("View all notifications").click();
  await expect(targetPage).toHaveURL(/\/notifications$/);
  await expect(targetPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
  const markNotificationRead = targetPage.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/api\/notifications\/[a-f\d]{24}/i.test(response.url()),
  );
  await targetPage.getByText("New friend request").first().click();
  expect((await markNotificationRead).ok()).toBe(true);
  await targetPage.getByRole("tab", { name: "Requests" }).click();
  const received = targetPage.getByRole("listitem").filter({ hasText: "E2E Test" });
  await expect(received.getByRole("img", { name: "Received" })).toBeVisible({ timeout: 30_000 });
  await received.getByRole("button", { name: "Actions" }).click();
  await targetPage.getByRole("menuitem", { name: "Decline friend request" }).click();
  const declineResponse = targetPage.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && response.url().includes("/api/friend-requests/"),
  );
  await targetPage.getByRole("button", { name: "Decline", exact: true }).click();
  expect((await declineResponse).ok()).toBe(true);
  await expect(targetPage.getByText("No friend requests")).toBeVisible({ timeout: 30_000 });

  // A rejected request can be sent again from the contextual action, then accepted.
  await page.reload();
  await findTarget(page);
  await sendFriendRequest(page);
  await targetPage.reload();
  await targetPage.getByRole("tab", { name: "Requests" }).click();
  const receivedAgain = targetPage.getByRole("listitem").filter({ hasText: "E2E Test" });
  await expect(receivedAgain.getByRole("img", { name: "Received" })).toBeVisible({
    timeout: 30_000,
  });
  await receivedAgain.getByRole("button", { name: "Actions" }).click();
  await targetPage.getByRole("menuitem", { name: "Accept friend request" }).click();
  const acceptResponse = targetPage.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && response.url().includes("/api/friend-requests/"),
  );
  await targetPage.getByRole("button", { name: "Accept", exact: true }).click();
  expect((await acceptResponse).ok()).toBe(true);
  await targetPage.getByRole("tab", { name: "Connections" }).click();
  await expect(targetPage.getByText("E2E Test")).toBeVisible({ timeout: 30_000 });
  await expect(targetPage.getByRole("img", { name: "Friends" })).toBeVisible();

  // A slow, uncached following page must recover if an action cancels it.
  let followingDelayed = false;
  let releaseFollowing = () => {};
  const followingGate = new Promise<void>((resolve) => {
    releaseFollowing = resolve;
  });
  await page.route("**/api/relationships?*", async (route) => {
    if (
      !followingDelayed &&
      new URL(route.request().url()).searchParams.get("type") === "following"
    ) {
      followingDelayed = true;
      await followingGate;
    }
    await route.continue();
  });
  await page.reload();
  await expect.poll(() => followingDelayed).toBe(true);
  await page.getByRole("tab", { name: "Connections" }).click();
  await page.getByRole("button", { name: "Connections: Icon legend" }).click();
  const connectionLegend = page.getByRole("dialog");
  for (const description of [
    "Friendship accepted.",
    "People you follow.",
    "People who follow you.",
    "People you have blocked.",
    "Online",
    "Offline",
  ]) {
    await expect(connectionLegend.getByText(description, { exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(connectionLegend).toBeHidden();
  await expect(page.getByText("E2E Target")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Friends" })).toBeVisible();
  await targetContext.close();

  // One action removes friendship plus the actor's follow and refreshes every list.
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "Remove friend" }).click();
  const unfriendResponse = waitForRelationshipResponse(page, "DELETE", "friend");
  await page.getByRole("button", { name: "Remove friend", exact: true }).click();
  expect((await unfriendResponse).ok()).toBe(true);
  await expect(page.getByRole("img", { name: "Friends" })).toHaveCount(0);
  await findTarget(page);
  await page.getByRole("button", { name: "Actions" }).first().click();
  await expect(page.getByRole("menuitem", { name: "Follow", exact: true })).toBeVisible();

  // -- Follow → button flips to Unfollow.
  const followResponse = waitForRelationshipResponse(page, "POST", "follow");
  await page.getByRole("menuitem", { name: "Follow", exact: true }).click();
  expect((await followResponse).ok()).toBe(true);
  releaseFollowing();
  await page.unroute("**/api/relationships?*");
  await page.getByRole("tab", { name: "Connections" }).click();
  await expect(page.getByRole("img", { name: "Following" })).toBeVisible();
  await page.getByRole("tab", { name: "Search" }).click();
  await page.getByRole("button", { name: "Actions" }).first().click();
  await expect(page.getByRole("menuitem", { name: "Unfollow", exact: true })).toBeVisible();

  // -- Unfollow → back to Follow.
  const unfollowResponse = waitForRelationshipResponse(page, "DELETE", "follow");
  await page.getByRole("menuitem", { name: "Unfollow", exact: true }).click();
  expect((await unfollowResponse).ok()).toBe(true);
  await page.getByRole("button", { name: "Actions" }).first().click();
  await expect(page.getByRole("menuitem", { name: "Follow", exact: true })).toBeVisible();

  // -- Follow again (so blocking also removes the follow).
  const refollowResponse = waitForRelationshipResponse(page, "POST", "follow");
  await page.getByRole("menuitem", { name: "Follow", exact: true }).click();
  expect((await refollowResponse).ok()).toBe(true);
  await page.getByRole("button", { name: "Actions" }).first().click();
  await expect(page.getByRole("menuitem", { name: "Unfollow", exact: true })).toBeVisible();

  // -- Block via the kebab menu + confirmation dialog.
  await page.getByRole("menuitem", { name: "Block", exact: true }).click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  const blockResponse = waitForRelationshipResponse(page, "POST", "block");
  await dialog.getByRole("button", { name: "Block", exact: true }).click();
  expect((await blockResponse).ok()).toBe(true);

  // Blocked user disappears from search results.
  await expect(page.getByText("E2E Target").first()).toBeHidden({ timeout: 30_000 });

  // Blocked user appears in Connections, never Requests.
  await page.getByRole("tab", { name: "Requests" }).click();
  await expect(page.getByText("E2E Target")).toHaveCount(0);
  await page.getByRole("tab", { name: "Connections" }).click();
  await expect(page.getByText("E2E Target")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Blocked" })).toBeVisible();
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: /unblock/i }).click();
  const unblockResponse = waitForRelationshipResponse(page, "DELETE", "block");
  await page.getByRole("button", { name: "Unblock", exact: true }).click();
  expect((await unblockResponse).ok()).toBe(true);
  await expect(page.getByRole("img", { name: "Blocked" })).toHaveCount(0);

  // Back to search: the target is findable again.
  await page.getByRole("tab", { name: "Search" }).click();
  await expect(page.getByText("E2E Target").first()).toBeVisible({ timeout: 30_000 });
});
