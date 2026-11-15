import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for contextual invite acceptance`);
  return value;
}
// All mutations use provisioned Development users and disposable links; the fixture owner cleans up.
if (required("TABLE_INVITE_FIXTURE_ACK") !== "owned-disposable-private-table-invites")
  throw new Error("Owned disposable private Table fixtures required");
if (
  !required("CLERK_SECRET_KEY").startsWith("sk_test_") ||
  !required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY").startsWith("pk_test_")
)
  throw new Error("Development Clerk keys required; never Production");
const input = JSON.parse(required("TABLE_INVITE_INPUT")) as {
  managerPath: string;
  emptyManagerPath: string;
  forbiddenPath: string;
  seatedLink: string;
  waitingLink: string;
  expiredLink: string;
  revokedLink: string;
};
function preview(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    (!["localhost", "127.0.0.1"].includes(url.hostname) &&
      !(url.protocol === "https:" && url.hostname.endsWith(".vercel.app")))
  )
    throw new Error("Local/Preview fixtures only, never Production");
  return url;
}
const web = preview(required("PLAYWRIGHT_BASE_URL"));
const links = [input.seatedLink, input.waitingLink, input.expiredLink, input.revokedLink].map(
  preview,
);
const api = links[0].origin;
if (
  links.some(
    (url) =>
      url.origin !== api ||
      !/^\/invite\/[A-Za-z0-9_-]{22}$/.test(url.pathname) ||
      url.search ||
      url.hash,
  ) ||
  new Set(links.map((url) => url.href)).size !== links.length ||
  [input.managerPath, input.emptyManagerPath, input.forbiddenPath].some(
    (path) => !/^\/events\/[0-9a-f-]{36}\/tables\/[0-9a-f-]{36}\/invite$/.test(path),
  )
)
  throw new Error("Distinct owned API links and exact invitation picker paths required");
async function open(page: Page, link: string) {
  const url = new URL(withProtectionBypass(link, process.env.VERCEL_PROTECTION_BYPASS));
  if (process.env.VERCEL_PROTECTION_BYPASS)
    url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.href);
  await expect(page.getByRole("link", { name: "Open in app", exact: true })).toHaveAttribute(
    "href",
    `bgo-dev://${url.pathname}`,
  );
  await page.waitForFunction(() => Reflect.get(window, "Clerk")?.loaded);
  expect(
    await page.evaluate(() => Reflect.get(window, "Clerk").publishableKey.startsWith("pk_test_")),
  ).toBe(true);
}
async function authenticated(page: Page, link: string, email: string) {
  await setupClerkTestingToken({ page });
  await open(page, link);
  await clerk.signIn({ page, emailAddress: required(email) });
  await open(page, link);
}
function isClaim(url: string, method: string) {
  return (
    method === "POST" &&
    new URL(url).origin === api &&
    new URL(url).pathname === "/api/invites/claim"
  );
}
async function positiveChoices(page: Page) {
  for (const button of await page.getByRole("button", { name: /: Yes$/ }).all())
    await button.click();
}
for (const [path, description] of [
  [input.managerPath, "ordinary"],
  [input.emptyManagerPath, "empty candidates"],
]) {
  test(`manager generates/copies from the first row with ${description}`, async ({
    page,
    context,
  }) => {
    await authenticated(page, new URL(path, web).href, "E2E_EMAIL");
    await expect(page.getByRole("button", { name: "Generate invite", exact: true })).toBeVisible();
    if (description === "empty candidates")
      await expect(page.getByText("No members found", { exact: true })).toBeVisible();
    const first = page
      .locator("ul")
      .filter({ has: page.getByRole("button", { name: "Generate invite", exact: true }) })
      .getByRole("listitem")
      .first();
    await expect(first).toContainText("Generate invite");
    const created = page.waitForResponse(
      (r) =>
        new URL(r.url()).origin === api &&
        new URL(r.url()).pathname === "/api/invites" &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Generate invite", exact: true }).click();
    expect((await created).status()).toBe(201);
    const link = (await (await created).json()) as { link: string };
    expect(new URL(link.link).origin).toBe(api);
    await expect(page.getByText(link.link, { exact: true })).toBeVisible();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByRole("button", { name: "Copied!", exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link.link);
  });
}
test("forbidden contextual source never offers link generation", async ({ page }) => {
  await authenticated(page, new URL(input.forbiddenPath, web).href, "E2E_EMAIL");
  await expect(page.getByRole("searchbox", { name: /^Search (members|friends)$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate invite", exact: true })).toHaveCount(0);
});
for (const [link, position] of [
  [input.seatedLink, "SEATED"],
  [input.waitingLink, "WAITING"],
] as const) {
  test(`existing recipient explicitly accepts all disclosed effects and receives ${position}`, async ({
    page,
  }) => {
    const writes: string[] = [];
    page.on("request", (r) => {
      if (isClaim(r.url(), r.method())) writes.push(r.method());
    });
    await authenticated(page, link, "E2E_EMAIL_2");
    await expect(page.getByRole("heading", { name: "Review table invitation" })).toBeVisible();
    expect(writes).toHaveLength(0);
    await expect(page.getByText(/Accepting makes you friends with/)).toBeVisible();
    if (await page.getByRole("button", { name: /: Yes$/ }).count()) {
      await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Answer every option");
      expect(writes).toHaveLength(0);
    }
    await positiveChoices(page);
    const response = page.waitForResponse((r) => isClaim(r.url(), r.request().method()));
    await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    expect(await result.json()).toMatchObject({ success: true, table: { position } });
    await expect(page.getByRole("status")).toContainText("You are now connected with the inviter");
    await expect(
      page.getByText(
        position === "WAITING" ? "You joined the waiting list." : "You have a place at the table.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole("alert")).toHaveText("Invitation unavailable");
    expect(writes).toHaveLength(1);
  });
}
for (const [link, reason] of [
  [input.expiredLink, "expired"],
  [input.revokedLink, "revoked manager"],
]) {
  test(`${reason} link reveals no private review and cannot accept`, async ({ page }) => {
    await authenticated(page, link, "E2E_EMAIL_2");
    await expect(page.getByRole("alert")).toHaveText("Invitation unavailable");
    await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toHaveCount(
      0,
    );
  });
}
