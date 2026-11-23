import { forwardDevelopmentMcp } from "./src/developmentGateway";

export default (request: Request) =>
  forwardDevelopmentMcp(
    request,
    process.env.BGO_MCP_UPSTREAM_URL,
    process.env.VERCEL_PROTECTION_BYPASS,
  );
