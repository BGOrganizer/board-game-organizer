import { MatchDetail } from "@/components/matches/MatchDetail";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchDetail matchId={matchId} />;
}
