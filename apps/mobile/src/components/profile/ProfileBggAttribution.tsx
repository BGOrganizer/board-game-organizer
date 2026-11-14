import { Button } from "heroui-native/button";
import { Image, Linking, View } from "react-native";
import { ScopedTheme } from "uniwind";
import { useT } from "@/lib/i18n";
export function ProfileBggAttribution() {
  const t = useT();
  return (
    <Button
      variant="ghost"
      accessibilityLabel={t("Powered by BGG — open BoardGameGeek")}
      onPress={() => void Linking.openURL("https://boardgamegeek.com")}
    >
      <ScopedTheme theme="light">
        <View className="rounded-lg bg-surface" style={{ padding: 8 }}>
          <Image
            source={require("../../../assets/bgg-powered.png")}
            style={{ width: 120, height: 40 }}
            resizeMode="contain"
            accessibilityLabel={t("Powered by BGG")}
          />
        </View>
      </ScopedTheme>
    </Button>
  );
}
