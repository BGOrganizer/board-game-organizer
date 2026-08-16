import { View } from "react-native";

import { Counter } from "@/components/Counter";

export default function MatchesScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Counter />
    </View>
  );
}
