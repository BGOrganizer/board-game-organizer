import type { App } from "@modelcontextprotocol/ext-apps";

type ToolResponse = Pick<
  Awaited<ReturnType<App["callServerTool"]>>,
  "structuredContent" | "isError" | "_meta"
>;

export function record(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

export function toolOutput(result: ToolResponse) {
  if (result.isError) return undefined;
  const content = record(result.structuredContent);
  if (typeof content?.operation === "string" && Object.hasOwn(content, "data")) {
    const viewerUserId = result._meta?.viewerUserId;
    return {
      operation: content.operation,
      data: content.data,
      viewerUserId: typeof viewerUserId === "string" ? viewerUserId : undefined,
    };
  }
}

export type ToolOutput = NonNullable<ReturnType<typeof toolOutput>>;

export class RejectedToolCall extends Error {
  constructor(readonly status: number) {
    super("Board Game Organizer rejected the operation");
  }
}

export async function callToolResult(
  app: App,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const response = await app.callServerTool({ name, arguments: args }, { signal });
  if (response.isError) {
    const status = record(response.structuredContent)?.status;
    if (
      (typeof status === "number" && status >= 400 && status < 500) ||
      response._meta?.["mcp/www_authenticate"]
    ) {
      throw new RejectedToolCall(typeof status === "number" ? status : 401);
    }
  }
  const result = toolOutput(response);
  if (!result || result.operation !== name) throw new Error("Invalid tool response");
  return result;
}

export async function callTool(
  app: App,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return (await callToolResult(app, name, args, signal)).data;
}

export async function openWeb(app: App, path: string) {
  const webUrl = import.meta.env.VITE_BGO_WEB_URL || "https://app.board-game-organizer.com";
  const url = new URL(path, webUrl);
  return !(await app.openLink({ url: url.href })).isError;
}
