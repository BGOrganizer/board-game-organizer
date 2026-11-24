import { describe, expect, it, vi } from "vitest";
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

  it("allows only the configured Netlify web origin for credentialed requests", () => {
    const allowed = "https://pr-34-1234-2--bgo-web-development.netlify.app";
    vi.stubEnv("BGO_NETLIFY_WEB_ORIGIN", allowed);
    try {
      for (const [origin, expected] of [
        [allowed, allowed],
        ["https://unrelated.netlify.app", "*"],
      ]) {
        const request = new Request("http://api.local/api/x", { headers: { origin } });
        expect(getCorsHeaders(request)["Access-Control-Allow-Origin"]).toBe(expected);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("OPTIONS preflight echoes the request origin (regression: used '*' with no origin)", async () => {
    const req = new Request("http://api.local/api/invites", {
      method: "OPTIONS",
      headers: {
        origin: "https://web-xyz-board-game-organizers-projects.vercel.app",
        "access-control-request-method": "PATCH",
      },
    });
    const res = corsOptions(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://web-xyz-board-game-organizers-projects.vercel.app",
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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
