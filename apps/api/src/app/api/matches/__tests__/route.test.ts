import { auth } from "@clerk/nextjs/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTransaction } from "@/app/lib/db";
import { MatchError, MatchService } from "@/app/lib/match.service";
import * as invitationRoute from "../../match-invitations/[invitationId]/route";
import * as choiceRoute from "../[matchId]/choices/route";
import * as adminInvitationRoute from "../[matchId]/invitations/[invitationId]/route";
import * as invitationsRoute from "../[matchId]/invitations/route";
import * as detailRoute from "../[matchId]/route";
import * as statusRoute from "../[matchId]/status/route";
import * as matchesRoute from "../route";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: vi.fn() }));
vi.mock("@/app/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/db")>();
  return { ...actual, withTransaction: vi.fn(), getDb: vi.fn(async () => ({})) };
});

const matchId = "69409f64-7414-4e47-815c-36b01c1bff95";
const invitationId = "5f2c704d-52c8-496a-b7a6-ec1abacee010";
const match = { id: matchId, status: "PLANNING" };
const administrator = {
  id: "user_admin",
  name: "Admin Player",
  email: "admin@example.com",
  avatarUrl: null,
};
const invitation = { id: invitationId, status: "PENDING" };
const createBody = {
  name: "Friday games",
  dates: ["2026-10-01T20:00:00.000Z"],
  minPlayers: 2,
  maxPlayers: 4,
  invitedUserIds: [],
  gameIds: [1],
};

function request(path: string, method = "GET", body?: string, contentType = "application/json") {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": contentType },
    body,
  });
}

function matchContext(value = matchId) {
  return { params: Promise.resolve({ matchId: value }) };
}

function invitationContext(value = invitationId) {
  return { params: Promise.resolve({ invitationId: value }) };
}

function adminInvitationContext(match = matchId, invitation = invitationId) {
  return { params: Promise.resolve({ matchId: match, invitationId: invitation }) };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("match API routes", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_admin" } as never);
    vi.mocked(withTransaction).mockImplementation(async (operation) =>
      operation({ id: "session" } as never, {} as never),
    );
    vi.spyOn(MatchService.prototype, "requireCurrentUser").mockResolvedValue();
    vi.spyOn(MatchService.prototype, "create").mockResolvedValue(match as never);
    vi.spyOn(MatchService.prototype, "list").mockResolvedValue([match] as never);
    vi.spyOn(MatchService.prototype, "detail").mockResolvedValue({
      match,
      administrator,
      invitedPlayers: [],
      games: [],
    } as never);
    vi.spyOn(MatchService.prototype, "listInvitations").mockResolvedValue([invitation] as never);
    vi.spyOn(MatchService.prototype, "invite").mockResolvedValue(invitation as never);
    vi.spyOn(MatchService.prototype, "respond").mockResolvedValue(invitation as never);
    vi.spyOn(MatchService.prototype, "leave").mockResolvedValue();
    vi.spyOn(MatchService.prototype, "removeInvitation").mockResolvedValue();
    vi.spyOn(MatchService.prototype, "update").mockResolvedValue(match as never);
    vi.spyOn(MatchService.prototype, "deleteMatch").mockResolvedValue();
    vi.spyOn(MatchService.prototype, "setChoice").mockResolvedValue();
    vi.spyOn(MatchService.prototype, "setStatus").mockResolvedValue(match as never);
  });

  afterEach(() => vi.restoreAllMocks());

  it("creates a match with status 201", async () => {
    const response = await matchesRoute.POST(
      request("/api/matches", "POST", JSON.stringify(createBody)),
    );
    expect(response.status).toBe(201);
    expect(await json(response)).toEqual({ match });
    expect(MatchService.prototype.create).toHaveBeenCalledWith("user_admin", createBody);
  });

  it("lists matches and permits one protection bypass parameter", async () => {
    const response = await matchesRoute.GET(
      request("/api/matches?x-vercel-protection-bypass=preview"),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ matches: [match] });
  });

  it("rejects unknown and duplicate query parameters", async () => {
    expect((await matchesRoute.GET(request("/api/matches?other=value"))).status).toBe(400);
    expect(
      (
        await matchesRoute.GET(
          request("/api/matches?x-vercel-protection-bypass=a&x-vercel-protection-bypass=b"),
        )
      ).status,
    ).toBe(400);
  });

  it("rejects invalid create payloads", async () => {
    const response = await matchesRoute.POST(
      request("/api/matches", "POST", JSON.stringify({ ...createBody, minPlayers: 1 })),
    );
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Invalid request body" });

    const overCapacity = await matchesRoute.POST(
      request(
        "/api/matches",
        "POST",
        JSON.stringify({
          ...createBody,
          maxPlayers: 2,
          invitedUserIds: ["user_a", "user_b"],
        }),
      ),
    );
    expect(overCapacity.status).toBe(400);
  });

  it("rejects invalid JSON, media type, and oversized bodies", async () => {
    expect((await matchesRoute.POST(request("/api/matches", "POST", "{"))).status).toBe(400);
    expect(
      (await matchesRoute.POST(request("/api/matches", "POST", "{}", "text/plain"))).status,
    ).toBe(415);
    expect(
      (
        await matchesRoute.POST(
          request("/api/matches", "POST", JSON.stringify({ value: "x".repeat(16_385) })),
        )
      ).status,
    ).toBe(413);
  });

  it("rejects create query before parsing body", async () => {
    const response = await matchesRoute.POST(
      request("/api/matches?invalid=1", "POST", JSON.stringify(createBody)),
    );
    expect(response.status).toBe(400);
    expect(MatchService.prototype.create).not.toHaveBeenCalled();
  });

  it("requires authentication and synchronized user", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as never);
    expect((await matchesRoute.GET(request("/api/matches"))).status).toBe(401);

    vi.spyOn(MatchService.prototype, "requireCurrentUser").mockRejectedValueOnce(
      new MatchError(409, "User profile not synchronized"),
    );
    expect((await matchesRoute.GET(request("/api/matches"))).status).toBe(409);
  });

  it("maps domain and unknown errors", async () => {
    vi.spyOn(MatchService.prototype, "list").mockRejectedValueOnce(
      new MatchError(404, "Match not found"),
    );
    const domain = await matchesRoute.GET(request("/api/matches"));
    expect(domain.status).toBe(404);
    expect(await json(domain)).toEqual({ error: "Match not found" });

    vi.spyOn(MatchService.prototype, "list").mockRejectedValueOnce(new Error("database failed"));
    const unknown = await matchesRoute.GET(request("/api/matches"));
    expect(unknown.status).toBe(500);
    expect(await json(unknown)).toEqual({ error: "Internal server error" });
  });

  it("returns match detail", async () => {
    const response = await detailRoute.GET(request(`/api/matches/${matchId}`), matchContext());
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ match, administrator, invitedPlayers: [], games: [] });
    expect(MatchService.prototype.detail).toHaveBeenCalledWith("user_admin", matchId);
  });

  it("hides invented covers in match details without BGG access", async () => {
    vi.stubEnv("BGG_TOKEN", "");
    vi.mocked(MatchService.prototype.detail).mockResolvedValue({
      match,
      administrator,
      invitedPlayers: [],
      games: [
        {
          id: 1,
          name: "Azul",
          yearPublished: 2017,
          thumbnail: "https://cf.geekdo-static.com/covers/1.jpg",
        },
      ],
    } as never);
    try {
      const response = await detailRoute.GET(request(`/api/matches/${matchId}`), matchContext());
      expect(response.status).toBe(200);
      expect((await json(response)).games).toEqual([
        { id: 1, name: "Azul", yearPublished: 2017, thumbnail: null },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("never enriches a match detail for an unsigned viewer", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    const response = await detailRoute.GET(request(`/api/matches/${matchId}`), matchContext());
    expect(response.status).toBe(401);
    expect(MatchService.prototype.detail).not.toHaveBeenCalled();
  });

  it("rejects invalid detail id and query", async () => {
    expect((await detailRoute.GET(request("/api/matches/nope"), matchContext("nope"))).status).toBe(
      400,
    );
    expect(
      (await detailRoute.GET(request(`/api/matches/${matchId}?other=1`), matchContext())).status,
    ).toBe(400);
  });

  it("updates match fields", async () => {
    const changes = {
      name: "Updated match",
      dates: ["2026-11-01T20:00:00.000Z"],
      minPlayers: 2,
      maxPlayers: 5,
      invitedUserIds: ["user_guest"],
      gameIds: [1, 2],
    };
    const response = await detailRoute.PATCH(
      request(`/api/matches/${matchId}`, "PATCH", JSON.stringify(changes)),
      matchContext(),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ match });
    expect(MatchService.prototype.update).toHaveBeenCalledWith("user_admin", matchId, changes);
  });

  it("validates match update id, JSON, and body", async () => {
    expect(
      (
        await detailRoute.PATCH(
          request("/api/matches/nope", "PATCH", JSON.stringify({ maxPlayers: 5 })),
          matchContext("nope"),
        )
      ).status,
    ).toBe(400);
    expect(
      (await detailRoute.PATCH(request(`/api/matches/${matchId}`, "PATCH", "{"), matchContext()))
        .status,
    ).toBe(400);
    expect(
      (
        await detailRoute.PATCH(
          request(`/api/matches/${matchId}`, "PATCH", JSON.stringify({ maxPlayers: 1 })),
          matchContext(),
        )
      ).status,
    ).toBe(400);
  });

  it("validates and authenticates match status transitions", async () => {
    const path = `/api/matches/${matchId}/status`;
    const response = await statusRoute.PATCH(
      request(path, "PATCH", JSON.stringify({ status: "CREATED" })),
      matchContext(),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ match });
    expect(MatchService.prototype.setStatus).toHaveBeenCalledWith("user_admin", matchId, "CREATED");
    expect(
      (
        await statusRoute.PATCH(
          request(path, "PATCH", JSON.stringify({ status: "OTHER" })),
          matchContext(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await statusRoute.PATCH(
          request(path, "PATCH", JSON.stringify({ status: "PLANNING", other: true })),
          matchContext(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await statusRoute.PATCH(
          request(path, "PATCH", JSON.stringify({ status: "CREATED" })),
          matchContext("invalid"),
        )
      ).status,
    ).toBe(400);
    expect((await statusRoute.PATCH(request(path, "PATCH", "{"), matchContext())).status).toBe(400);
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    expect(
      (
        await statusRoute.PATCH(
          request(path, "PATCH", JSON.stringify({ status: "CREATED" })),
          matchContext(),
        )
      ).status,
    ).toBe(401);
  });

  it("validates and authenticates date/game choices", async () => {
    const dateChoice = { kind: "dates", itemId: "2026-09-12T18:00:00.000Z", choice: "YES" };
    const gameChoice = { kind: "games", itemId: 1, choice: "IF_NEEDED" };
    for (const choice of [dateChoice, gameChoice]) {
      const response = await choiceRoute.PATCH(
        request(`/api/matches/${matchId}/choices`, "PATCH", JSON.stringify(choice)),
        matchContext(),
      );
      expect(response.status).toBe(200);
      expect(MatchService.prototype.setChoice).toHaveBeenCalledWith("user_admin", matchId, choice);
    }
    expect(
      (
        await choiceRoute.PATCH(
          request(
            `/api/matches/${matchId}/choices`,
            "PATCH",
            JSON.stringify({ ...gameChoice, choice: "MAYBE" }),
          ),
          matchContext(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await choiceRoute.PATCH(
          request(`/api/matches/not-an-id/choices`, "PATCH", JSON.stringify(dateChoice)),
          matchContext("not-an-id"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await choiceRoute.PATCH(
          request(`/api/matches/${matchId}/choices`, "PATCH", "{"),
          matchContext(),
        )
      ).status,
    ).toBe(400);
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    expect(
      (
        await choiceRoute.PATCH(
          request(`/api/matches/${matchId}/choices`, "PATCH", JSON.stringify(dateChoice)),
          matchContext(),
        )
      ).status,
    ).toBe(401);
  });

  it("deletes a match as admin and validates id", async () => {
    const response = await detailRoute.DELETE(
      request(`/api/matches/${matchId}`, "DELETE"),
      matchContext(),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ success: true });
    expect(MatchService.prototype.deleteMatch).toHaveBeenCalledWith("user_admin", matchId);
    expect(
      (await detailRoute.DELETE(request("/api/matches/nope", "DELETE"), matchContext("nope")))
        .status,
    ).toBe(400);
  });

  it("lists and creates nested invitations", async () => {
    const listed = await invitationsRoute.GET(
      request(`/api/matches/${matchId}/invitations`),
      matchContext(),
    );
    expect(await json(listed)).toEqual({ invitations: [invitation] });

    const created = await invitationsRoute.POST(
      request(
        `/api/matches/${matchId}/invitations`,
        "POST",
        JSON.stringify({ inviteeUserId: "user_guest" }),
      ),
      matchContext(),
    );
    expect(created.status).toBe(201);
    expect(await json(created)).toEqual({ invitation });
  });

  it("validates nested invitation ids and bodies", async () => {
    expect(
      (await invitationsRoute.GET(request("/api/matches/nope/invitations"), matchContext("nope")))
        .status,
    ).toBe(400);
    expect(
      (
        await invitationsRoute.POST(
          request(`/api/matches/${matchId}/invitations`, "POST", JSON.stringify({})),
          matchContext(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await invitationsRoute.POST(
          request("/api/matches/nope/invitations", "POST", "{}"),
          matchContext("nope"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await invitationsRoute.POST(
          request(`/api/matches/${matchId}/invitations`, "POST", "{"),
          matchContext(),
        )
      ).status,
    ).toBe(400);
  });

  it("accepts and declines invitations", async () => {
    const accepted = await invitationRoute.PATCH(
      request(
        `/api/match-invitations/${invitationId}`,
        "PATCH",
        JSON.stringify({ decision: "accept" }),
      ),
      invitationContext(),
    );
    expect(await json(accepted)).toEqual({ invitation });
    expect(MatchService.prototype.respond).toHaveBeenCalledWith(
      "user_admin",
      invitationId,
      "accept",
    );

    await invitationRoute.PATCH(
      request(
        `/api/match-invitations/${invitationId}`,
        "PATCH",
        JSON.stringify({ decision: "decline" }),
      ),
      invitationContext(),
    );
    expect(MatchService.prototype.respond).toHaveBeenLastCalledWith(
      "user_admin",
      invitationId,
      "decline",
    );
  });

  it("validates invitation action id and body", async () => {
    expect(
      (
        await invitationRoute.PATCH(
          request("/api/match-invitations/nope", "PATCH", JSON.stringify({ decision: "accept" })),
          invitationContext("nope"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await invitationRoute.PATCH(
          request(
            `/api/match-invitations/${invitationId}`,
            "PATCH",
            JSON.stringify({ decision: "maybe" }),
          ),
          invitationContext(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await invitationRoute.PATCH(
          request(`/api/match-invitations/${invitationId}`, "PATCH", "{"),
          invitationContext(),
        )
      ).status,
    ).toBe(400);
  });

  it("lets accepted invitee leave", async () => {
    const response = await invitationRoute.DELETE(
      request(`/api/match-invitations/${invitationId}`, "DELETE"),
      invitationContext(),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ success: true });
    expect(MatchService.prototype.leave).toHaveBeenCalledWith("user_admin", invitationId);
  });

  it("rejects invalid leave id and query", async () => {
    expect(
      (
        await invitationRoute.DELETE(
          request("/api/match-invitations/nope", "DELETE"),
          invitationContext("nope"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await invitationRoute.DELETE(
          request(`/api/match-invitations/${invitationId}?other=1`, "DELETE"),
          invitationContext(),
        )
      ).status,
    ).toBe(400);
  });

  it("lets admin remove an invitation or accepted player", async () => {
    const response = await adminInvitationRoute.DELETE(
      request(`/api/matches/${matchId}/invitations/${invitationId}`, "DELETE"),
      adminInvitationContext(),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ success: true });
    expect(MatchService.prototype.removeInvitation).toHaveBeenCalledWith(
      "user_admin",
      matchId,
      invitationId,
    );
  });

  it("validates admin invitation removal ids and query", async () => {
    expect(
      (
        await adminInvitationRoute.DELETE(
          request(`/api/matches/nope/invitations/${invitationId}`, "DELETE"),
          adminInvitationContext("nope", invitationId),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await adminInvitationRoute.DELETE(
          request(`/api/matches/${matchId}/invitations/nope`, "DELETE"),
          adminInvitationContext(matchId, "nope"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await adminInvitationRoute.DELETE(
          request(`/api/matches/${matchId}/invitations/${invitationId}?other=1`, "DELETE"),
          adminInvitationContext(),
        )
      ).status,
    ).toBe(400);
  });

  it("serves CORS preflight", () => {
    expect(matchesRoute.OPTIONS(request("/api/matches", "OPTIONS")).status).toBe(204);
  });
});
