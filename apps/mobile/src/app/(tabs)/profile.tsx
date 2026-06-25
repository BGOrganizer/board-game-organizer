import { View, Text } from 'react-native';
import { Profile } from "@/components/Profile";

export default function Tab() {
  return (
    <View className="flex-1 bg-background p-6">
      <Profile />
    </View>
  );
}

