import { View } from "react-native";

import { Profile } from "@/components/Profile";
import { TabScreen } from "@/components/TabScreen";

export default function ProfileScreen() {
  return (
    <TabScreen title="Profile">
      <View className="flex-1 p-6">
        <Profile />
      </View>
    </TabScreen>
  );
}
