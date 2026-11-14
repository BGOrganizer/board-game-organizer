import { expect, type Page } from "@playwright/test";

/** Complete the required location step in tests focused on other wizard fields. */
export async function selectMatchLocation(page: Page) {
  await expect(page.getByRole("heading", { name: "Locations", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "ci-location",
            address: "123 Main St, Rome, Italy",
            longitude: 12.5,
            latitude: 41.9,
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "Select location" }).click();
  await page.getByRole("textbox", { name: "Location name" }).fill("Game cafe");
  await page.getByRole("searchbox", { name: "Search address" }).fill("Main St Rome");
  await page.getByRole("button", { name: "123 Main St, Rome, Italy", exact: true }).click();
  await page.getByRole("button", { name: "Confirm location" }).click();
  await expect(page.getByText("Game cafe", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
}
