import { describe, expect, it } from "vitest";
import { corsJson, corsOptions, getCorsHeaders } from "../cors";

describe("CORS helpers", () => {
  it("echoes a vercel.app preview origin", () => {
    const req = new Request("http://api.local/api/x", {
      headers: { origin: "https://web-abc-board-game-organizers-projects.vercel.app" },
    });
    expect(getCorsHeaders(req)["Access-Control-Allow-Origin"]).toBe(
      "https://web-abc-board-game-organizers-projects.vercel.app",
    );
  });

  it("allows configured origins", () => {
    process.env.ALLOWED_ORIGINS = "https://bgo.example.com";
    const req = new Request("http://api.local/api/x", {
      headers: { origin: "https://bgo.example.com" },
    });
    expect(getCorsHeaders(req)["Access-Control-Allow-Origin"]).toBe("https://bgo.example.com");
    delete process.env.ALLOWED_ORIGINS;
  });

  it("OPTIONS preflight echoes the request origin (regression: used '*' with no origin)", async () => {
    const req = new Request("http://api.local/api/invites", {
      method: "OPTIONS",
      headers: { origin: "https://web-xyz-board-game-organizers-projects.vercel.app" },
    });
    const res = corsOptions(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://web-xyz-board-game-organizers-projects.vercel.app",
    );
  });

  it("corsJson echoes the request origin", async () => {
    const req = new Request("http://api.local/api/invites", {
      headers: { origin: "https://web-xyz-board-game-organizers-projects.vercel.app" },
    });
    const res = corsJson({ ok: true }, {}, req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://web-xyz-board-game-organizers-projects.vercel.app",
    );
  });
});
