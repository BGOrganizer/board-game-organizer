import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw Error(`${name} required for owned detail scrolling acceptance`);
  return value;
}
if (required("DETAIL_SCROLL_ACK") !== "owned-preview-build")
  throw Error("Owned Development fixture required");
const base = new URL(required("PLAYWRIGHT_BASE_URL"));
if (!["localhost", "127.0.0.1"].includes(base.hostname) && !base.hostname.endsWith(".vercel.app"))
  throw Error("Local/Preview only, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw Error("Development Clerk only");
const input = JSON.parse(required("DETAIL_SCROLL_INPUT")) as {
  kind: "group" | "event" | "table";
  id: string;
  eventId?: string;
  tab: string;
  lastRow: string;
  mode: "list" | "static";
};
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !input ||
  !["group", "event", "table"].includes(input.kind) ||
  !["list", "static"].includes(input.mode) ||
  !uuid.test(input.id) ||
  (input.kind === "table" && !uuid.test(input.eventId ?? "")) ||
  typeof input.tab !== "string" ||
  !input.tab.trim() ||
  typeof input.lastRow !== "string" ||
  !input.lastRow.trim()
)
  throw Error("Valid owned resource, tab and off-page row required");

for (const width of [390, 1280]) {
  test(`scrolls the actual detail card with the document beneath a persistent header at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 760 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const path =
      input.kind === "group"
        ? `/groups/${input.id}`
        : input.kind === "event"
          ? `/events/${input.id}`
          : `/events/${input.eventId}/tables/${input.id}`;
    await page.goto(path);
    const header = page.locator("[data-app-header]");
    const toolbar = page.locator("[data-page-toolbar]").first();
    const back = toolbar.getByRole("link", { name: /^(Back|Indietro)$/, exact: true });
    await expect(back).toBeVisible();
    await expect(back).toHaveText("");
    expect(await toolbar.evaluate((node) => node.closest("nav"))).toBeNull();
    const position = await toolbar.evaluate((node) => {
      const left = node.firstElementChild?.getBoundingClientRect();
      const right = node.lastElementChild?.getBoundingClientRect();
      return left && right
        ? {
            left: left.left,
            leftRight: left.right,
            right: right.left,
            leftCenter: left.top + left.height / 2,
            rightCenter: right.top + right.height / 2,
          }
        : null;
    });
    if (!position) throw Error("Missing page toolbar layout");
    expect(position.right).toBeGreaterThanOrEqual(position.leftRight);
    expect(Math.abs(position.leftCenter - position.rightCenter)).toBeLessThanOrEqual(1);
    const card = page.getByTestId("record-identity-card").first();
    await expect(card).toBeInViewport();
    await page.getByRole("tab", { name: input.tab, exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(card).toBeInViewport();
    const requests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() === "GET" &&
        url.pathname.includes(input.id) &&
        (url.searchParams.has("cursor") || url.searchParams.has("after"))
      )
        requests.push(url.pathname);
    });
    const last = page.getByText(input.lastRow, { exact: true }).first();
    for (let attempt = 0; attempt < 40; attempt++) {
      if (
        (await last.isVisible()) &&
        (await last.evaluate((node) => node.getBoundingClientRect().top < window.innerHeight))
      )
        break;
      const before = await page.evaluate(() => ({
        top: window.scrollY,
        height: document.documentElement.scrollHeight,
      }));
      await page.mouse.wheel(0, 550);
      await expect
        .poll(async () => {
          const after = await page.evaluate(() => ({
            top: window.scrollY,
            height: document.documentElement.scrollHeight,
          }));
          return after.top > before.top || after.height > before.height;
        })
        .toBe(true);
    }
    await expect(last).toBeInViewport();
    await expect(card).not.toBeInViewport();
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBeGreaterThan(0);
    expect(await page.locator("#tab-content-scroll").evaluate((node) => node.scrollTop)).toBe(0);
    await expect(header).toBeInViewport();
    expect((await header.boundingBox())?.y).toBe(0);
    // A cold owned fixture has a genuinely off-page final row, not a loaded static test list.
    if (input.mode === "list") expect(requests.length).toBeGreaterThan(0);
    if (input.mode === "list" && input.kind === "event") {
      const windowed = page.getByTestId("document-window-list");
      await expect(windowed).toHaveCount(1);
      const count = await windowed.locator(":scope > li").count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(40);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(card).toBeInViewport();
    await expect(page.getByRole("tab", { name: input.tab, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
}
