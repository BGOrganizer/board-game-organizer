import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: "object" } & Record<string, unknown>;
  readOnly: boolean;
  destructive?: boolean;
  sensitive?: boolean;
}

interface ServerOptions {
  tools: readonly McpTool[];
  scopes: (tool: McpTool) => string[];
  getChallenge: (tool: McpTool) => string | undefined;
  run: (tool: McpTool, args: unknown, signal: AbortSignal) => Promise<Response>;
  readWidget: () => Promise<string>;
  resourceDomains: string[];
  viewerUserId?: string;
}

const widgetUri = "ui://board-game-organizer/response.html";
const widgetMimeType = "text/html;profile=mcp-app";

export async function handleMcp(request: Request, options: ServerOptions): Promise<Response> {
  const server = new Server(
    { name: "board-game-organizer", version: "1.0.0" },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        "Use Board Game Organizer to organize board game sessions, read the user's records and update them at their request. Open the group form with prepare_group_creation. Confirm writes with the user, especially invitations, removals and result publication. The API enforces BGO access rights.",
    },
  );
  const tools = new Map(options.tools.map((tool) => [tool.name, tool]));
  const resource = { uri: widgetUri, name: "Board Game Organizer", mimeType: widgetMimeType };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: options.tools.map((tool) => {
      const securitySchemes = [{ type: "oauth2", scopes: options.scopes(tool) }];
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: tool.destructive ?? false,
          openWorldHint: true,
        },
        securitySchemes,
        _meta: {
          securitySchemes,
          ui: tool.sensitive ? { visibility: ["app"] } : { resourceUri: widgetUri },
        },
      };
    }),
  }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [resource] }));
  server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
    if (params.uri !== widgetUri) throw new McpError(ErrorCode.InvalidParams, "Unknown resource");
    return {
      contents: [
        {
          ...resource,
          text: await options.readWidget(),
          _meta: {
            ui: {
              csp: { resourceDomains: options.resourceDomains },
              prefersBorder: true,
            },
          },
        },
      ],
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async ({ params }, { signal }) => {
    const tool = tools.get(params.name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, "Unknown tool");
    const challenge = options.getChallenge(tool);
    if (challenge) {
      return {
        isError: true,
        content: [{ type: "text", text: "Connect your Board Game Organizer account to continue." }],
        _meta: { "mcp/www_authenticate": [challenge] },
      };
    }

    try {
      const result = await options.run(tool, params.arguments ?? {}, signal);
      const data: unknown = result.status === 204 ? null : await result.json();
      if (!result.ok) {
        const error =
          result.status < 500 &&
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string" &&
          /^[A-Z_]{3,90}$/.test(data.error)
            ? data.error
            : `HTTP_${result.status}`;
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Board Game Organizer could not complete ${tool.name} (${error}).`,
            },
          ],
          structuredContent: { operation: tool.name, status: result.status, error },
        };
      }
      return {
        content: [{ type: "text", text: `Board Game Organizer completed ${tool.name}.` }],
        structuredContent: { operation: tool.name, data },
        ...(options.viewerUserId ? { _meta: { viewerUserId: options.viewerUserId } } : {}),
      };
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: "Board Game Organizer could not complete the request." }],
        structuredContent: { operation: tool.name, status: 500, error: "INTERNAL_ERROR" },
      };
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
