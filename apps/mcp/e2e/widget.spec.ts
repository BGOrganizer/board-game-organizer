import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { groupRecord, plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";

const origin = "https://mcp-host.example.test";
const groupId = "70f48c08-821b-4e1a-9ee6-9efa2e3afe19";
const profile = {
  id: "user_avery",
  name: "Avery",
  username: "avery",
  avatarUrl: null,
  social: { friends: 2, following: 3, followers: 4 },
  player: { gamesPlayed: 1, gamesWon: 0, winRate: 0 },
};
const history = {
  items: [
    {
      ...plannedTable,
      eventStatus: "TERMINATED",
      id: "46d59b46-969b-4b03-99a8-525d1e96d222",
      eventId: "fd82f631-a33c-49db-adba-dc63526ecaf6",
      name: "Hegemony",
      eventName: "Game night",
    },
  ],
  nextCursor: null,
};
const linkedGroup = { ...groupRecord, id: groupId, canViewMembers: true, canViewEvents: true };
const linkedEvent = {
  ...plannedEvent,
  id: history.items[0].eventId,
  groupId,
  groupName: linkedGroup.name,
};

async function openWidget(page: Page, operation: string, data: unknown) {
  const html = await readFile(new URL("../dist/widget.html", import.meta.url), "utf8");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${origin}/widget`, (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: {
        "content-security-policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:",
      },
      body: html,
    }),
  );
  await page.route(`${origin}/`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><body>
      <iframe title="Board Game Organizer" sandbox="allow-scripts" style="width:100%;height:800px;border:0"></iframe>
      <script>
        const iframe = document.querySelector('iframe');
        const input = ${JSON.stringify({ operation, data })};
        addEventListener('message', (event) => {
          if (event.source !== iframe.contentWindow || event.data?.jsonrpc !== '2.0') return;
          const message = event.data;
          function send(result) {
            iframe.contentWindow.postMessage({ jsonrpc: '2.0', ...result }, '*');
          }
          if (message.method === 'ui/initialize') {
            send({ id: message.id, result: {
              protocolVersion: message.params.protocolVersion,
              hostInfo: { name: 'BGO test host', version: '1' },
              hostCapabilities: { serverTools: {}, openLinks: {} },
              hostContext: {
                locale: 'en', theme: 'dark', displayMode: 'inline',
                availableDisplayModes: message.params.appCapabilities?.availableDisplayModes ?? ['inline'],
              },
            } });
          }
          if (message.method === 'ui/notifications/initialized') {
            send({ method: 'ui/notifications/tool-result', params: { content: [], structuredContent: input } });
          }
          if (message.method === 'tools/call' && message.params.name === 'create_group') {
            const body = message.params.arguments.body;
            document.body.dataset.group = JSON.stringify(body);
            send({ id: message.id, result: { content: [], structuredContent: {
              operation: 'create_group', data: { id: '${groupId}', name: body.name },
            } } });
          }
          if (message.method === 'tools/call' && message.params.name === 'get_table') {
            document.body.dataset.table = message.params.arguments.params.tableId;
            send({ id: message.id, result: { content: [], structuredContent: {
              operation: 'get_table', data: ${JSON.stringify(history.items[0])},
            } } });
          }
          const reads = {
            get_group: ${JSON.stringify(linkedGroup)},
            get_event: ${JSON.stringify(linkedEvent)},
            list_events: ${JSON.stringify({ items: [linkedEvent], nextCursor: null })},
            list_event_tables: ${JSON.stringify(history)},
            list_group_members: ${JSON.stringify({ items: [profile], nextCursor: null })},
          };
          if (message.method === 'tools/call' && Object.hasOwn(reads, message.params.name)) {
            send({ id: message.id, result: { content: [], structuredContent: {
              operation: message.params.name, data: reads[message.params.name],
            } } });
          }
          if (message.method === 'ui/request-display-mode') {
            document.body.dataset.mode = message.params.mode;
            send({ id: message.id, result: { mode: message.params.mode } });
          }
          if (message.method === 'tools/call' && message.params.name === 'get_user_profile') {
            document.body.dataset.profile = message.params.arguments.params.userId;
            send({ id: message.id, result: { content: [], structuredContent: {
              operation: 'get_user_profile', data: ${JSON.stringify(profile)},
            } } });
          }
          if (message.method === 'ui/open-link') {
            document.body.dataset.opened = message.params.url;
            send({ id: message.id, result: {} });
          }
        });
        iframe.src = '${origin}/widget';
      </script></body></html>`,
    }),
  );
  await page.goto(origin);
  return { frame: page.frameLocator('iframe[title="Board Game Organizer"]'), errors };
}

test("navigates from history to a table and back inside the sandboxed widget", async ({ page }) => {
  const { frame, errors } = await openWidget(page, "list_table_history", history);
  await expect(frame.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(frame.locator("#root")).toHaveCSS("padding-top", "32px");
  await expect(frame.locator("#root")).toHaveCSS("padding-bottom", "32px");
  await expect(frame.getByText("Hegemony")).toBeVisible();
  await frame.getByRole("button", { name: "Open table: Hegemony" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-table", history.items[0].id);
  await expect(frame.getByRole("heading", { name: "Hegemony", exact: true })).toBeVisible();
  await expect(frame.getByRole("tab", { name: "Results" })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "fullscreen");
  await expect(frame.getByRole("heading", { name: "History" })).toBeHidden();
  await expect(page.locator("body")).not.toHaveAttribute("data-opened", /./);
  await frame.getByRole("button", { name: "Back" }).click();
  await expect(frame.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "inline");
  await expect(frame.getByRole("button", { name: "Open table: Hegemony" })).toBeFocused();
  expect(errors).toEqual([]);
});

test("opens BGO group and event details, with local tab switching and Back", async ({ page }) => {
  const { frame, errors } = await openWidget(page, "list_groups", {
    items: [linkedGroup],
    nextCursor: null,
  });
  await frame.getByRole("button", { name: `Open group: ${linkedGroup.name}` }).click();
  await expect(frame.getByRole("tablist", { name: "Group sections" })).toBeVisible();
  await frame.getByRole("tab", { name: "Members" }).click();
  await expect(frame.getByText("@avery")).toBeVisible();
  await frame.getByRole("tab", { name: "Events" }).click();
  await frame.getByRole("button", { name: `Open event: ${linkedEvent.name}` }).click();
  await frame.getByRole("tab", { name: "Tables" }).click();
  await frame.getByRole("button", { name: "Open table: Hegemony" }).click();
  await expect(frame.getByRole("tablist", { name: "Table sections" })).toBeVisible();
  await frame.getByRole("button", { name: "Back" }).click();
  await expect(frame.getByRole("tab", { name: "Tables" })).toHaveAttribute("aria-selected", "true");
  await frame.getByRole("button", { name: "Back" }).click();
  await expect(frame.getByRole("tab", { name: "Events" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("body")).not.toHaveAttribute("data-opened", /./);
  expect(errors).toEqual([]);
});

test("requires an explicit form submission before calling the create group tool", async ({
  page,
}) => {
  const { frame, errors } = await openWidget(page, "prepare_group_creation", {});
  const submit = frame.getByRole("button", { name: "Create group" });
  await expect(submit).toBeDisabled();
  await expect(page.locator("body")).not.toHaveAttribute("data-group", /./);
  await frame.getByRole("textbox", { name: "Group name" }).fill("Friday games");
  await submit.click();
  await expect(frame.getByRole("status")).toHaveText("Group created");
  await expect(page.locator("body")).toHaveAttribute("data-group", /"name":"Friday games"/);
  expect(errors).toEqual([]);
});

for (const [operation, label, data] of [
  ["list_friends", "Avery", { rows: [{ profile }], nextCursor: null }],
  [
    "list_community_activity",
    "avery",
    {
      items: [
        {
          id: "friendly-games",
          kind: "group_join",
          occurredAt: "2026-11-22T20:08:00.000Z",
          context: "Friendly games",
          href: `/groups/${groupId}`,
          author: profile,
        },
      ],
      nextCursor: null,
    },
  ],
] as const) {
  test(`opens a profile from ${operation} and returns without opening an external link`, async ({
    page,
  }) => {
    const { frame, errors } = await openWidget(page, operation, data);
    await frame.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-profile", profile.id);
    await expect(frame.getByRole("heading", { name: "Profile" })).toBeVisible();
    await frame.getByRole("button", { name: "Back" }).click();
    await expect(frame.getByRole("button", { name: label, exact: true })).toBeFocused();
    await expect(page.locator("body")).not.toHaveAttribute("data-opened", /./);
    expect(errors).toEqual([]);
  });
}

test("renders the existing BGO event artwork and interactive visibility popover", async ({
  page,
}) => {
  const { frame, errors } = await openWidget(page, "list_events", {
    items: [plannedEvent],
    nextCursor: null,
  });
  await expect(frame.getByRole("heading", { name: "Events" })).toBeVisible();
  await frame.getByRole("button", { name: "Private event" }).click();
  await expect(
    frame.getByText("Participation is limited to authorized group members or invited users."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
