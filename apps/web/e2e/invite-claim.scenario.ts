import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned invite-claim acceptance`);
  return value;
}
// Claims are real. Fixture owner supplies fresh pending links and removes only its own data.
if (required("INVITE_CLAIM_FIXTURE_ACK") !== "owned-disposable-invites-existing-users")
  throw new Error("Owned disposable invites and two existing Development users required");
if (
  !required("CLERK_SECRET_KEY").startsWith("sk_test_") ||
  !required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY").startsWith("pk_test_")
)
  throw new Error("Development Clerk keys required; never Production");
const input = JSON.parse(required("INVITE_CLAIM_INPUT")) as {
  signInLink: string;
  manualLink: string;
  expiredLink: string;
  inviterId: string;
};
const links = [input.signInLink, input.manualLink, input.expiredLink].map((v) => new URL(v));
const api = links[0].origin;
for (const url of [...links, new URL(required("PLAYWRIGHT_BASE_URL"))]) {
  if (
    url.username ||
    url.password ||
    (!["localhost", "127.0.0.1"].includes(url.hostname) &&
      !(url.protocol === "https:" && url.hostname.endsWith(".vercel.app")))
  )
    throw new Error("Local/Preview fixtures only, never Production");
}
if (
  links.some(
    (url) =>
      url.origin !== api ||
      !/^\/invite\/[A-Za-z0-9_-]{22}$/.test(url.pathname) ||
      url.search ||
      url.hash,
  ) ||
  new Set(links.map((url) => url.pathname)).size !== 3 ||
  !/^user_[A-Za-z0-9]+$/.test(input.inviterId)
)
  throw new Error(
    "Three distinct owned API invite links and the inviter's exact Clerk ID required",
  );

async function open(page: Page, link: string) {
  const url = new URL(withProtectionBypass(link, process.env.VERCEL_PROTECTION_BYPASS));
  // Only initial navigation establishes a bypass cookie; callback/storage contain no bypass secret.
  if (process.env.VERCEL_PROTECTION_BYPASS)
    url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.href);
  await page.waitForFunction(() => Reflect.get(window, "Clerk")?.loaded);
  expect(
    await page.evaluate(() => Reflect.get(window, "Clerk").publishableKey.startsWith("pk_test_")),
  ).toBe(true);
}
async function authenticated(page: Page, link: string) {
  await setupClerkTestingToken({ page });
  await open(page, link);
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL_2") });
  await open(page, link);
  await expect(page.getByRole("button", { name: "Claim invite", exact: true })).toBeEnabled();
}
const isClaim = (url: string, method: string) =>
  method === "POST" &&
  new URL(url).origin === api &&
  new URL(url).pathname === "/api/invites/claim";
function claims(page: Page) {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (isClaim(request.url(), request.method())) writes.push(request.method());
  });
  return writes;
}

test("sign-in callback completes the original claim once and survives a cold page reload", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  const writes = claims(page);
  await open(page, input.signInLink);
  await page.getByRole("button", { name: "Sign in to claim", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /email|username/i }).fill(required("E2E_EMAIL_2"));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel(/^Password$/i).fill(required("INVITE_CLAIM_PASSWORD"));
  const response = page.waitForResponse((r) => isClaim(r.url(), r.request().method()));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  const next = await Promise.race([
    response.then(() => "claimed" as const),
    dialog
      .getByRole("heading", { name: "Check your email", exact: true })
      .waitFor()
      .then(() => "device-verification" as const),
  ]);
  if (next === "device-verification") {
    if (!required("E2E_EMAIL_2").includes("+clerk_test"))
      throw new Error("Device Trust requires an owned Clerk Development test-email fixture");
    await page.keyboard.type("424242");
  }
  expect((await response).status()).toBe(200);
  const callback = new URL(page.url());
  expect(callback.origin).toBe(api);
  expect(callback.pathname).toBe(links[0].pathname);
  expect(callback.searchParams.get("claim")).toBe("1");
  await expect(page.getByRole("status")).toHaveText(
    "Invite claimed — you are now friends with the inviter!",
  );
  expect(writes).toHaveLength(1);
  const friends = await page.evaluate(async () => {
    const session = Reflect.get(window, "Clerk").session;
    if (!session) throw new Error("Authenticated fixture session required");
    const token = await session.getToken();
    if (!token) throw new Error("Authenticated fixture token required");
    const result = await fetch("/api/relationships?type=friends&limit=20", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!result.ok) throw new Error(`Friendship read failed: ${result.status}`);
    return result.json() as Promise<{ rows: Array<{ fromUserId: string; toUserId: string }> }>;
  });
  expect(
    friends.rows.some(
      (row) => row.fromUserId === input.inviterId || row.toUserId === input.inviterId,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Claim invite", exact: true })).toBeEnabled();
  expect(writes).toHaveLength(1);
});

test("switching to sign-up preserves the invite callback (not a completed new-account signup)", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  const writes = claims(page);
  await open(page, input.signInLink);
  await page.getByRole("button", { name: "Sign in to claim", exact: true }).waitFor();
  await page.evaluate(() => {
    const sdk = Reflect.get(window, "Clerk"),
      original = sdk.openSignIn.bind(sdk);
    sdk.openSignIn = (options) => {
      Reflect.set(window, "__inviteRedirects", [
        options?.forceRedirectUrl,
        options?.signUpForceRedirectUrl,
      ]);
      return original(options);
    };
  });
  await page.getByRole("button", { name: "Sign in to claim", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Sign up", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Create your account", exact: true }),
  ).toBeVisible();
  for (const value of await page.evaluate(
    () => Reflect.get(window, "__inviteRedirects") as string[],
  )) {
    const callback = new URL(value, api);
    expect(callback.origin).toBe(api);
    expect(callback.pathname).toBe(links[0].pathname);
    expect([...callback.searchParams]).toEqual([["claim", "1"]]);
  }
  expect(writes).toHaveLength(0);
});

test("an authenticated URL visit grants no consent; the explicit action still claims", async ({
  page,
}) => {
  const writes = claims(page);
  const uninitiated = new URL(input.manualLink);
  uninitiated.searchParams.set("claim", "1");
  await authenticated(page, uninitiated.href);
  expect(writes).toHaveLength(0);
  const response = page.waitForResponse((r) => isClaim(r.url(), r.request().method()));
  await page.getByRole("button", { name: "Claim invite", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("status")).toBeVisible();
  expect(writes).toHaveLength(1);
});

for (const [name, link, status] of [
  ["expired", input.expiredLink, 410],
  ["unknown", new URL("/invite/AAAAAAAAAAAAAAAAAAAAAA", api).href, 404],
] as const) {
  test(`${name} invite remains an observable failure with a retry action`, async ({ page }) => {
    await authenticated(page, link);
    const response = page.waitForResponse((r) => isClaim(r.url(), r.request().method()));
    await page.getByRole("button", { name: "Claim invite", exact: true }).click();
    expect((await response).status()).toBe(status);
    await expect(page.getByRole("alert")).toHaveText(`HTTP ${status}`);
    await expect(page.getByRole("button", { name: "Claim invite", exact: true })).toBeEnabled();
    await expect(page.getByRole("status")).toHaveCount(0);
  });
}
