import { Gamepad2 } from "lucide-react-native";
import { Image, View } from "react-native";

export function LeaderboardGameCover({ imageUrl }: { imageUrl: string | null }) {
  return imageUrl ? (
    <Image
      accessible={false}
      source={{ uri: imageUrl }}
      style={{ width: 20, height: 24, borderRadius: 4 }}
    />
  ) : (
    <View style={{ width: 20, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Gamepad2 size={16} color="#737373" />
    </View>
  );
}
