import { Stack } from "expo-router";
import { GroupList } from "@/components/groups/GroupList";
import { useT } from "@/lib/i18n";
export default function SearchGroupsScreen() {
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t("Search groups") }} />
      <GroupList scope="public" />
    </>
  );
}
