import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { handleMcp } from "@board-game-organizer/mcp";
import { groupTypeSchema, resourceNameSchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { withMcpActor } from "@/app/lib/mcp/actor";
import {
  authenticateMcp,
  BGO_READ_SCOPE,
  BGO_WRITE_SCOPE,
  type McpConfiguration,
  mcpAuthenticationChallenge,
  readMcpConfiguration,
} from "@/app/lib/mcp/auth";
import { operations } from "@/app/lib/mcp/operations";
import { showRecords, showRecordsTool } from "@/app/lib/mcp/record-presentation";

export const runtime = "nodejs";

const groupDraft = z.strictObject({
  name: resourceNameSchema.optional(),
  type: groupTypeSchema.optional(),
});

const prepareGroupCreation = {
  name: "prepare_group_creation",
  description:
    "Open the interactive BGO group creation form without creating a group. Use this when the user wants to create a group and has not yet chosen its details.",
  inputSchema: { ...z.toJSONSchema(groupDraft), type: "object" as const },
  readOnly: true,
  presentation: "widget" as const,
};
// These have an actionable or navigable view in the chat. The rest return their API data.
const widgetOperations = new Set([
  "get_group",
  "create_group",
  "update_group",
  "get_group_moderation_review",
  "decide_group_moderation_review",
  "list_group_leaderboard",
  "list_group_members",
  "list_group_invitees",
  "get_event",
  "create_event",
  "update_event",
  "change_event_state",
  "finalize_event_results",
  "list_event_participants",
  "get_table",
  "list_table_history",
  "list_table_leaderboard",
  "list_table_seats",
  "list_table_invitees",
  "save_table_result",
  "search_users",
  "list_user_suggestions",
  "list_relationships",
  "list_follows",
  "list_blocked_users",
  "list_friends",
  "list_friend_requests",
  "get_my_profile",
  "get_user_profile",
  "list_profile_activity",
  "list_community_activity",
  "list_profile_games",
  "get_profile_game_history",
  "list_notifications",
  "list_notification_changes",
  "create_invite",
  "search_bgg_games",
  "get_bgg_games",
  "list_bgg_game_picker",
  "list_bgg_collection",
  "list_global_leaderboard",
  "search_locations",
  "list_favorite_locations",
  "save_favorite_location",
]);
const tools = [
  prepareGroupCreation,
  showRecordsTool,
  ...operations.map((operation) =>
    widgetOperations.has(operation.name)
      ? { ...operation, presentation: "widget" as const }
      : operation,
  ),
];
const operationsByName = new Map(operations.map((operation) => [operation.name, operation]));

function allowedOrigin(request: Request, config: McpConfiguration): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(config.resourceUrl).origin;
}

export async function GET(request: Request): Promise<Response> {
  const config = readMcpConfiguration();
  if (!config) return new Response(null, { status: 404 });
  if (!allowedOrigin(request, config)) return new Response(null, { status: 403 });

  const hasAuthorization = request.headers.has("Authorization");
  const identity = hasAuthorization ? await authenticateMcp(request, config) : null;
  if (!identity) {
    return new Response(null, {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store",
        "WWW-Authenticate": mcpAuthenticationChallenge(
          config,
          BGO_READ_SCOPE,
          hasAuthorization ? "invalid_token" : undefined,
        ),
      },
    });
  }

  // The server handles requests over POST and does not open an unsolicited SSE stream.
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const config = readMcpConfiguration();
  if (!config) return new Response(null, { status: 404 });
  if (!allowedOrigin(request, config)) return new Response(null, { status: 403 });
  const apiOrigin = new URL(request.url).origin;

  const hasAuthorization = request.headers.has("Authorization");
  const identity = hasAuthorization ? await authenticateMcp(request, config) : null;
  if (hasAuthorization && !identity) {
    return new Response(null, {
      status: 401,
      headers: {
        "WWW-Authenticate": mcpAuthenticationChallenge(config, undefined, "invalid_token"),
      },
    });
  }

  // MCP clients may discover tools and load their static widget before starting user OAuth.
  const scope = (tool: { readOnly: boolean }) => (tool.readOnly ? BGO_READ_SCOPE : BGO_WRITE_SCOPE);
  const response = await handleMcp(request, {
    tools,
    viewerUserId: identity?.userId,
    scopes: (tool) => [scope(tool)],
    getChallenge: (tool) => {
      const required = scope(tool);
      if (!identity) return mcpAuthenticationChallenge(config, required);
      if (!identity.scopes.includes(required)) {
        return mcpAuthenticationChallenge(config, required, "insufficient_scope");
      }
    },
    run: (tool, args, signal) => {
      if (!identity) return Promise.resolve(new Response(null, { status: 401 }));
      if (tool.name === prepareGroupCreation.name) {
        const draft = groupDraft.safeParse(args);
        return Promise.resolve(
          draft.success
            ? Response.json(draft.data)
            : Response.json({ error: "INVALID_INPUT" }, { status: 400 }),
        );
      }
      if (tool.name === showRecordsTool.name) {
        return withMcpActor(identity.userId, () => showRecords(apiOrigin, args, signal));
      }
      const operation = operationsByName.get(tool.name);
      if (!operation) return Promise.resolve(new Response(null, { status: 404 }));
      return withMcpActor(identity.userId, () => operation.run(apiOrigin, args, signal));
    },
    readWidget: () =>
      readFile(resolve(process.cwd(), "../mcp/dist/widget.html"), "utf8").catch(() =>
        readFile(resolve(process.cwd(), "apps/mcp/dist/widget.html"), "utf8"),
      ),
    resourceDomains: [
      apiOrigin,
      "https://cf.geekdo-images.com",
      "https://images.boardgamegeek.com",
      "https://img.clerk.com",
    ],
  });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, headers });
}
