import { useLocalSearchParams } from "expo-router";
import { Typography } from "heroui-native/text";
import { GroupPeoplePicker } from "@/components/groups/GroupPeoplePicker";
import { useT } from "@/lib/i18n";
export default function GroupInviteScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>(),
    t = useT();
  return groupId ? (
    <GroupPeoplePicker groupId={groupId} mode="invite" />
  ) : (
    <Typography accessibilityRole="alert" className="text-danger">
      {t("Group not found")}
    </Typography>
  );
}
