import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";

const origin = "https://mcp-host.example.test";
const groupId = "70f48c08-821b-4e1a-9ee6-9efa2e3afe19";
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
              hostContext: { locale: 'en', theme: 'dark' },
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

test("renders the packaged history in a sandbox and opens a table through the host", async ({
  page,
}) => {
  const { frame, errors } = await openWidget(page, "list_table_history", history);
  await expect(frame.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(frame.getByText("Hegemony")).toBeVisible();
  await frame.getByRole("button", { name: "Open table: Hegemony" }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-opened",
    /\/events\/.*\/tables\/46d59b46/,
  );
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
