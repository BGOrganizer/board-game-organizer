import { useLocalSearchParams } from "expo-router";
import { MatchDetail } from "@/components/matches/MatchDetail";

export default function MatchDetailScreen() {
  const { matchId: parameter, tab } = useLocalSearchParams<{
    matchId: string | string[];
    tab?: string;
  }>();
  const matchId = (Array.isArray(parameter) ? parameter[0] : parameter) ?? "";
  return <MatchDetail key={matchId} matchId={matchId} initialTab={tab} />;
}
