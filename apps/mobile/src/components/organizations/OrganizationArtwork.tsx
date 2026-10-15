import type { OrganizationResponse } from "@board-game-organizer/schemas";

import { useThemeColor } from "heroui-native/hooks";

import { Crown } from "lucide-react-native";

import { Image, View } from "react-native";

export function OrganizationArtwork({ organization }: { organization: OrganizationResponse }) {
  const warning = useThemeColor("warning");
  return (
    <View style={{ width: 64, height: 64, flexShrink: 0 }}>
      <Image
        source={{ uri: organization.logo }}
        resizeMode="contain"
        accessible={false}
        style={{ width: 64, height: 64, borderRadius: 12 }}
      />
      {organization.role === "admin" ? (
        <View style={{ position: "absolute", left: 0, top: 0 }}>
          <Crown size={16} color={warning} />
        </View>
      ) : null}
    </View>
  );
}
