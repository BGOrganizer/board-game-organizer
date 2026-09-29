import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

const email = process.env.E2E_EMAIL ?? "";

test("BGG link failure, complete sync, picker filters and confirmed unlink", async ({ page }) => {
  test.setTimeout(180_000);
  if (!email) throw new Error("E2E_EMAIL required for authenticated BGG E2E");
  let active = false;
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  };
  await page.route("**/api/bgg/account**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname.endsWith("/sync")) {
      active = true;
    } else if (request.method() === "DELETE") {
      active = false;
    } else if (request.method() === "POST") {
      const { username } = request.postDataJSON();
      if (username === "unknown") {
        await route.fulfill({ status: 404, headers, json: { error: "BGG user not found" } });
        return;
      }
    }
    await route.fulfill({
      headers,
      json: {
        active: active
          ? { id: 41, username: "alice", avatarUrl: null, snapshot: "snap", syncedAt: "2026-09-01" }
          : null,
        pending:
          !active && request.method() === "POST"
            ? {
                id: 41,
                username: "alice",
                avatarUrl: null,
                snapshot: "snap",
                status: "syncing",
                attempts: 0,
                nextAttemptAt: null,
              }
            : null,
      },
    });
  });
  await page.route("**/api/bgg/picker**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const params = new URL(route.request().url()).searchParams;
    const collection = active && params.get("collection") !== "off";
    const search = params.get("search") !== "off" && (params.get("query")?.length ?? 0) >= 4;
    await route.fulfill({
      headers,
      json: {
        items: [
          ...(collection
            ? [
                {
                  id: 1,
                  name: "Azul",
                  imageUrl: null,
                  year: 2017,
                  average: 7.5,
                  rank: 1,
                  source: "collection",
                },
              ]
            : []),
          ...(search
            ? [
                {
                  id: 2,
                  name: "Azul Summer",
                  imageUrl: null,
                  year: 2024,
                  average: 7,
                  rank: 2,
                  source: "search",
                },
              ]
            : []),
        ],
        nextCursor: null,
      },
    });
  });

  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, signInParams: { strategy: "email_code", identifier: email } });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Sync with BoardGameGeek" })).toBeVisible();
  await page.getByRole("button", { name: "Sync with BoardGameGeek" }).click();
  await page.getByRole("textbox", { name: "BGG username" }).fill("unknown");
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("BGG user not found");
  await page.getByRole("textbox", { name: "BGG username" }).fill("alice");
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sync with BoardGameGeek" })).not.toBeVisible();
  await expect(page.getByText("alice", { exact: true })).toBeVisible();

  await page.goto("/matches");
  await page.getByLabel("Create a match").click();
  await page.getByPlaceholder("e.g. Friday night games").fill("Friday night games");
  await page.locator('input[type="datetime-local"]').first().fill("2026-09-05T20:00");
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Add game" }).click();
  await expect(page.getByRole("button", { name: "Collection", exact: true })).toBeVisible();
  await expect(page.getByText("Azul", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search board games" }).fill("Azul");
  await expect(page.getByText("Azul Summer")).toBeVisible();
  await page.getByRole("button", { name: "Collection", exact: true }).click();
  await expect(page.getByText("Azul", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear" }).click();

  await page.goto("/profile");
  await page.getByRole("button", { name: "Disconnect BoardGameGeek" }).click();
  await expect(page.getByRole("dialog", { name: "Disconnect BoardGameGeek?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("alice", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect BoardGameGeek" }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sync with BoardGameGeek" })).toBeVisible();
});
