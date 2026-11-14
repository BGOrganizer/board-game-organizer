import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), transaction: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: m.db, withTransaction: m.transaction }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: vi.fn() }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/app/lib/notifications/push", () => ({ dispatchNotifications: vi.fn() }));
const routes = [
  () => import("../route"),
  () => import("../[matchId]/route"),
  () => import("../[matchId]/choices/route"),
  () => import("../[matchId]/status/route"),
  () => import("../[matchId]/results/route"),
  () => import("../[matchId]/invitations/route"),
  () => import("../[matchId]/invitations/[invitationId]/route"),
  () => import("../[matchId]/join-requests/route"),
  () => import("../[matchId]/join-requests/[invitationId]/route"),
  () => import("../[matchId]/leaderboard/route"),
  () => import("../../match-invitations/[invitationId]/route"),
  () => import("../../organizations/route"),
  () => import("../../organizations/[organizationId]/route"),
  () => import("../../organizations/[organizationId]/members/route"),
  () => import("../../organizations/[organizationId]/members/[userId]/route"),
  () => import("../../organizations/[organizationId]/membership/route"),
  () => import("../../organizations/[organizationId]/events/route"),
  () => import("../../organizations/[organizationId]/review/route"),
  () => import("../../organization-assets/route"),
  () => import("../../organization-assets/[assetId]/route"),
  () => import("../../organization-assets/[assetId]/complete/route"),
];
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ userId: "actor" });
});
describe("retired operational Match/Organization URLs", () => {
  it.each(routes.map((load, i) => ({ load, i })))(
    "never read or recreate old collections at route $i",
    async ({ load }) => {
      const mod = (await load()) as Record<
        string,
        (request: Request) => Promise<Response> | Response
      >;
      for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
        if (!mod[method]) continue;
        const response = await mod[method](
          new Request("https://api.test", { method, ...(method !== "GET" ? { body: "{" } : {}) }),
        );
        expect(response.status).toBe(410);
        expect(await response.json()).toEqual({ error: "LEGACY_DOMAIN_RETIRED" });
        m.auth.mockResolvedValueOnce({ userId: null });
        expect((await mod[method](new Request("https://api.test", { method }))).status).toBe(401);
      }
      expect(
        (await mod.OPTIONS(new Request("https://api.test", { method: "OPTIONS" }))).status,
      ).toBe(204);
      expect(m.db).not.toHaveBeenCalled();
      expect(m.transaction).not.toHaveBeenCalled();
    },
  );
});
