import ClaimInvitePage from "@/components/ClaimInvitePage";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <ClaimInvitePage token={token} />
      </main>
    </div>
  );
}
