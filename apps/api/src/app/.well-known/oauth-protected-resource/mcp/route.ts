import { BGO_READ_SCOPE, BGO_WRITE_SCOPE, readMcpConfiguration } from "@/app/lib/mcp/auth";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export function GET(): Response {
  const config = readMcpConfiguration();
  if (!config) return new Response(null, { status: 404, headers });

  return Response.json(
    {
      resource: config.resourceUrl,
      resource_name: "Board Game Organizer",
      authorization_servers: [config.issuer],
      scopes_supported: [BGO_READ_SCOPE, BGO_WRITE_SCOPE],
      bearer_methods_supported: ["header"],
    },
    { headers },
  );
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
