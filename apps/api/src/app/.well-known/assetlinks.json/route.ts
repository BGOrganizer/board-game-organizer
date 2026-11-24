import {
  appLinkAssociation,
  isProductionInviteDeployment,
} from "@/app/lib/invites/app-link-association";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(appLinkAssociation(isProductionInviteDeployment()), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
