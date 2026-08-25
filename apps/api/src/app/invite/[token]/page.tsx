import { ClerkProvider } from "@clerk/nextjs";
import ClaimInvite from "./claim";

export const dynamic = "force-dynamic";

/**
 * Public claim page hosted BY THE API: the invite link points at
 * `{apiUrl}/invite/<token>` (never at the web app). Server wrapper awaits the
 * params and renders the client claim component (ClerkProvider wraps it).
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClaimInvite token={token} />
    </ClerkProvider>
  );
}
