import { Stack } from "expo-router";
import { Groups } from "@/components/groups/Groups";
import { useT } from "@/lib/i18n";
export default function SearchGroupsScreen() {
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t("Groups") }} />
      <Groups initialSection="search" />
    </>
  );
}
