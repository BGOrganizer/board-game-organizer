import { appLinkAssociation } from "@/app/lib/invites/app-link-association";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(appLinkAssociation(process.env.VERCEL_ENV === "production"), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
