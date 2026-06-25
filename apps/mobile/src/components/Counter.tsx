import { useAppStore } from "@board-game-organizer/store";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Text, View } from "react-native";

export function Counter() {
  const count = useAppStore((s) => s.count);
  const increment = useAppStore((s) => s.increment);
  const decrement = useAppStore((s) => s.decrement);
  const reset = useAppStore((s) => s.reset);

  return (
    <Card className="mt-6 items-center p-4">
      <Text className="mb-1 text-xs text-default-400">Counter (Zustand)</Text>
      <Text className="my-2 text-3xl font-bold">{count}</Text>
      <View className="flex-row gap-2">
        <Button onPress={decrement}>-1</Button>
        <Button onPress={increment} color="primary">
          +1
        </Button>
        <Button onPress={reset}>Reset</Button>
      </View>
    </Card>
  );
}