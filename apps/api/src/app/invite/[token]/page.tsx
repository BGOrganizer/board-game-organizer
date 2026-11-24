import { ClerkProvider } from "@clerk/nextjs";
import { isProductionInviteDeployment } from "@/app/lib/invites/app-link-association";
import { InviteAppLink } from "./InviteAppLink";
import { InviteLanding } from "./InviteLanding";
import { InviteProviders } from "./InviteProviders";

export const dynamic = "force-dynamic";

/**
 * Public claim page hosted BY THE API: the invite link points at
 * `{apiUrl}/invite/<token>` (never at the web app). Server wrapper awaits the
 * params and renders the client claim component (ClerkProvider wraps it).
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const production = isProductionInviteDeployment();
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <InviteProviders>
        <InviteAppLink token={token} production={production} />
        <InviteLanding key={token} token={token} />
      </InviteProviders>
    </ClerkProvider>
  );
}
