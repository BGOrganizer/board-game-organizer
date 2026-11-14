import { useLocalSearchParams } from "expo-router";
import { GroupReview } from "@/components/groups/GroupReview";
export default function Screen() {
  const p = useLocalSearchParams<{ groupId: string }>();
  return <GroupReview groupId={p.groupId ?? ""} />;
}
