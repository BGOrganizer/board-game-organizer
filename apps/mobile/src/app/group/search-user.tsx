import { useAppStore } from "@board-game-organizer/store";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Typography } from "heroui-native/text";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useT } from "@/lib/i18n";
export default function GroupFriendSearchScreen() {
  const { slotId, exclude } = useLocalSearchParams<{ slotId?: string; exclude?: string }>(),
    router = useRouter(),
    t = useT();
  const setPendingUser = useAppStore((state) => state.setPendingUser);
  if (!slotId)
    return (
      <Typography accessibilityRole="alert" className="text-danger">
        {t("Missing selection destination")}
      </Typography>
    );
  return (
    <>
      <Stack.Screen options={{ title: t("Search friends") }} />
      <PeoplePicker
        friendsOnly
        excludeIds={(exclude ?? "").split(",").filter(Boolean)}
        onSelect={(person) => {
          setPendingUser(slotId, {
            id: person.id,
            name: person.name,
            email: person.email,
            avatarUrl: person.avatarUrl,
          });
          router.back();
        }}
      />
    </>
  );
}
