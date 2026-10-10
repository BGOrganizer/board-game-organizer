import { Typography } from "heroui-native/text";
import { View } from "react-native";

export function LeaderboardStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Typography className="text-xs text-muted">{label}</Typography>
      <Typography className="font-medium text-foreground">{value}</Typography>
    </View>
  );
}
