import { MatchDetail } from "@/components/MatchDetail";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchDetail matchId={matchId} />;
}
