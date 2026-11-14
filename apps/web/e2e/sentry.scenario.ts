import { expect, test } from "@playwright/test";

const target = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000");
if (
  !["http:", "https:"].includes(target.protocol) ||
  target.username ||
  target.password ||
  (!["localhost", "127.0.0.1"].includes(target.hostname) &&
    !(target.protocol === "https:" && target.hostname.endsWith(".vercel.app")))
)
  throw new Error("Sentry acceptance requires an owned local/Preview deployment, never Production");
const expectedDsn = process.env.SENTRY_ACCEPTANCE_WEB_DSN;
if (!expectedDsn) throw new Error("SENTRY_ACCEPTANCE_WEB_DSN must identify the owned Web project");
const project = new URL(expectedDsn);
const projectPath = project.pathname.split("/");
const projectId = projectPath.pop();
const envelopePath = `${projectPath.join("/")}/api/${projectId}/envelope/`;

for (const status of [200, 503]) {
  test(`browser errors use the Web development project; ingest responds ${status}`, async ({
    page,
  }) => {
    const marker = `BGO owned Sentry acceptance ${status}`;
    let event: Record<string, unknown> | undefined;
    let endpoint: URL | undefined;
    // Inspect the real browser SDK envelope without sending test errors to Sentry.
    await page.route(
      (url) => url.pathname.endsWith("/envelope/"),
      async (route) => {
        const lines = route.request().postData()?.split("\n") ?? [];
        for (let i = 1; i + 1 < lines.length; i += 2) {
          if (JSON.parse(lines[i]).type !== "event") continue;
          const payload = JSON.parse(lines[i + 1]);
          if (
            payload.exception?.values?.some((value: { value?: string }) => value.value === marker)
          ) {
            event = payload;
            endpoint = new URL(route.request().url());
          }
        }
        await route.fulfill({ status, body: "{}", contentType: "application/json" });
      },
    );
    await page.goto(target.href);
    await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
    await page.evaluate((message) => {
      setTimeout(() => {
        throw new Error(message);
      }, 0);
    }, marker);
    await expect.poll(() => event).toBeTruthy();
    expect(endpoint?.origin).toBe(project.origin);
    expect(endpoint?.pathname).toBe(envelopePath);
    expect(endpoint?.searchParams.get("sentry_key")).toBe(project.username);
    expect(event?.environment).toBe("development");
    for (const field of ["user", "request", "breadcrumbs", "extra", "contexts", "transaction"])
      expect(event).not.toHaveProperty(field);
    await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
  });
}
