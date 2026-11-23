import { forwardMcpGateway, type GatewayEnvironment } from "./src/developmentGateway";

declare const BGO_GATEWAY_TARGET: GatewayEnvironment;

export default (request: Request) =>
  forwardMcpGateway(request, {
    target: BGO_GATEWAY_TARGET,
    upstream: process.env.BGO_MCP_UPSTREAM_URL,
    previewBypass: process.env.VERCEL_PROTECTION_BYPASS,
  });
