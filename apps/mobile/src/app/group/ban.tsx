import { useLocalSearchParams } from "expo-router";
import { Typography } from "heroui-native/text";
import { GroupPeoplePicker } from "@/components/groups/GroupPeoplePicker";
import { useT } from "@/lib/i18n";
export default function GroupBanScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>(),
    t = useT();
  return groupId ? (
    <GroupPeoplePicker groupId={groupId} mode="ban" />
  ) : (
    <Typography accessibilityRole="alert" className="text-danger">
      {t("Group not found")}
    </Typography>
  );
}
