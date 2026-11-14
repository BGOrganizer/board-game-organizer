import type {
  CommunityPageResponse,
  GroupLeaderboardResponse,
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
    ranking: "Ranking",
    boardGame: it ? "Gioco da tavolo" : "Board game",
    searchGames: it ? "Cerca giochi da tavolo" : "Search board games",
    roles: it ? "Ruoli e partecipazione" : "Roles and participation",
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

for (const colorScheme of ["light", "dark"] as const) {
  test(`owned Group rankings use current roles and a contained game viewport (${colorScheme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 520 });
    await page.emulateMedia({ colorScheme });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const gamePage = await read<GroupLeaderboardResponse>(
      page,
      `groups/${groupId}/leaderboard?limit=25`,
    );
    const game = gamePage.games.find((row) => row.name.trim().length >= 4);
    if (!game)
      throw new Error(
        "Owned Group-ranking fixture requires a rated game (name at least four characters) on its first source page",
      );
    const playerPage = await read<GroupLeaderboardResponse>(
      page,
      `groups/${groupId}/leaderboard?limit=25&gameId=${game.id}`,
    );
    const players = playerPage.players
      .filter((player) => !player.left && player.groupRole && player.username)
      .slice(0, 4);
    if (!players.length)
      throw new Error(
        "Owned Group-ranking fixture requires a currently accepted ranked player on the first source page and the current role-projecting API",
      );
    await page.goto(`/groups/${groupId}`);
    await page.getByRole("tab", { name: labels.ranking, exact: true }).click();
    await page.getByRole("button", { name: new RegExp(labels.boardGame) }).click();
    await page
      .getByRole("searchbox", { name: labels.searchGames, exact: true })
      .fill(game.name.slice(0, 4));
    const option = page.getByRole("option", { name: game.name, exact: true });
    await expect(option).toBeVisible();
    await expect
      .poll(() =>
        page.getByRole("listbox").evaluate((list) => {
          const popover = list.closest('[data-slot="select-popover"]');
          if (!popover) return false;
          const inner = list.getBoundingClientRect(),
            outer = popover.getBoundingClientRect();
          return (
            inner.top >= outer.top - 1 &&
            inner.bottom <= outer.bottom + 1 &&
            inner.left >= outer.left - 1 &&
            inner.right <= outer.right + 1 &&
            getComputedStyle(popover).overflowY === "hidden" &&
            getComputedStyle(list).overflowY === "auto"
          );
        }),
      )
      .toBe(true);
    await option.click();
    const grid = page.getByRole("grid");
    const captions = {
      ADMIN: it ? "Amministratore" : "Admin",
      MODERATOR: it ? "Moderatore" : "Moderator",
      MEMBER: it ? "Membro accettato" : "Accepted member",
    };
    for (const player of players) {
      const handle = formatUsername(player.username, "Username unavailable");
      const row = grid.getByRole("row").filter({ has: page.getByText(handle, { exact: true }) });
      await expect(row.getByText(handle, { exact: true })).toBeVisible();
      const caption = captions[player.groupRole!];
      await expect(row.getByText(caption, { exact: true })).toBeVisible();
      await row.getByRole("button", { name: caption, exact: true }).click();
      const popup = page.getByRole("dialog", { name: labels.roles, exact: true });
      await expect(popup.getByText(caption, { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
    }
  });
}
