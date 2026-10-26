import { useLocalSearchParams } from "expo-router";
import { GroupDetail } from "@/components/groups/GroupDetail";
export default function Screen() {
  const p = useLocalSearchParams<{ groupId: string; tab?: string }>();
  const initialTab = p.tab === "events" || p.tab === "members" ? p.tab : "info";
  return (
    <GroupDetail
      key={`${p.groupId}:${initialTab}`}
      groupId={p.groupId ?? ""}
      initialTab={initialTab}
    />
  );
}
