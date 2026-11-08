import type {
  CommunityPageResponse,
  GroupPersonResponse,
  GroupRecordResponse,
} from "@board-game-organizer/schemas";
import { formatUsername, withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned Group-role acceptance`);
  return value;
}
const api = new URL(required("GROUP_ROLE_API_URL")),
  groupId = required("GROUP_ROLE_GROUP_ID"),
  target = required("GROUP_ROLE_TARGET_ID"),
  locale = required("GROUP_ROLE_LOCALE"),
  email = required("E2E_EMAIL");
if (required("GROUP_ROLE_FIXTURE_ACK") !== "owned-development-moderator-group")
  throw new Error(
    "Owned disposable Development/Preview Group required; this scenario changes its target's role and may leave it promoted on failure",
  );
if (
  !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(groupId) ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(target) ||
  !["en", "it"].includes(locale)
)
  throw new Error("Invalid Group-role fixture identifiers or locale");
for (const url of [api, new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000")])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Use local/Preview fixtures, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Development Clerk keys required");
const it = locale === "it",
  labels = {
    members: it ? "Membri" : "Members",
    manage: it ? "Gestisci membro" : "Manage member",
    promote: it ? "Rendi moderatore" : "Make moderator",
    demote: it ? "Rendi membro ordinario" : "Demote to member",
    ban: it ? "Banna dal gruppo" : "Ban from group",
    remove: it ? "Rimuovi membro" : "Remove member",
    cancel: it ? "Annulla" : "Cancel",
  };
async function read<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated owned fixture required");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`);
      return response.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${path}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}
test("creator cancels destructive actions, confirms role changes and reloads the canonical role", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  const group = await read<GroupRecordResponse>(page, `groups/${groupId}`),
    people = await read<CommunityPageResponse<GroupPersonResponse>>(
      page,
      `groups/${groupId}/members?mode=accepted&limit=50`,
    ),
    person = people.items.find((p) => p.userId === target);
  if (
    group.role !== "admin" ||
    !person ||
    person.isAdmin ||
    person.membership?.status !== "ACCEPTED" ||
    person.membership.role === "MODERATOR"
  )
    throw new Error(
      "Creator session and an ordinary accepted target on the bounded first roster page required",
    );
  const manageName = `${labels.manage}: ${person.username || person.name}`,
    titleName = formatUsername(person.username, person.name ?? "Username unavailable");
  await page.goto(`/groups/${groupId}`);
  await page.getByRole("tab", { name: labels.members, exact: true }).click();
  for (const label of [labels.ban, labels.remove, labels.promote]) {
    await page.getByRole("button", { name: manageName, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: manageName, exact: true });
    await expect(sheet.getByRole("button", { name: labels.ban, exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: labels.remove, exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: labels.promote, exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: label, exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: `${label}: ${titleName}`, exact: true });
    const cancel = confirmation.getByRole("button", { name: labels.cancel, exact: true });
    await expect(cancel).toBeFocused();
    expect(await confirmation.evaluate((element) => element.matches(":modal"))).toBe(true);
    if (label === labels.remove) await page.keyboard.press("Escape");
    else await cancel.click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole("button", { name: manageName, exact: true })).toBeFocused();
    expect(
      (
        await read<CommunityPageResponse<GroupPersonResponse>>(
          page,
          `groups/${groupId}/members?mode=accepted&limit=50`,
        )
      ).items.find((p) => p.userId === target)?.membership?.role,
    ).not.toBe("MODERATOR");
  }
  for (const [label, next] of [
    [labels.promote, labels.demote],
    [labels.demote, labels.promote],
  ]) {
    await page.getByRole("button", { name: manageName, exact: true }).click();
    await page
      .getByRole("dialog", { name: manageName, exact: true })
      .getByRole("button", { name: label, exact: true })
      .click();
    await page
      .getByRole("dialog", { name: `${label}: ${titleName}`, exact: true })
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: `${label}: ${titleName}`, exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await page.getByRole("tab", { name: labels.members, exact: true }).click();
    await page.getByRole("button", { name: manageName, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: manageName, exact: true });
    await expect(sheet.getByRole("button", { name: next, exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await sheet.getByRole("button", { name: labels.cancel, exact: true }).click();
  }
});
