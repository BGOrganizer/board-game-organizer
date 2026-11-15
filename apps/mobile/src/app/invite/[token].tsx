import { useLocalSearchParams } from "expo-router";
import { InviteClaimScreen } from "@/components/invites/InviteClaimScreen";
export default function Screen() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  return <InviteClaimScreen token={token} />;
}
