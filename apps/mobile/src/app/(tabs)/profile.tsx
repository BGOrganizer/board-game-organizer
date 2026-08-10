import { Profile } from "@/components/Profile";
import { View } from "react-native";

export default function ProfileScreen() {
  return (
    <View className="flex-1 bg-background p-6">
      <Profile />
    </View>
  );
}
