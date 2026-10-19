import { useLocalSearchParams } from "expo-router";
import { GroupDetail } from "@/components/groups/GroupDetail";
export default function Screen() {
  const p = useLocalSearchParams<{ groupId: string }>();
  return <GroupDetail groupId={p.groupId ?? ""} />;
}
