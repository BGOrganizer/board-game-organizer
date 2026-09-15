import { getMobileNumber, MOBILE_NUMBER_METADATA_KEY } from "@board-game-organizer/schemas";
import { useUser } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import { useState } from "react";
import { View } from "react-native";

import { useT } from "@/lib/i18n";

export default function MobileNumberScreen() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const t = useT();
  const [mobileNumber, setMobileNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const savedMobileNumber = getMobileNumber(user?.unsafeMetadata);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Skeleton isLoading variant="pulse" style={{ width: 220, height: 32, borderRadius: 8 }} />
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 48, borderRadius: 8 }}
        />
      </View>
    );
  }

  if (!user) return <Redirect href="/" />;
  if (savedMobileNumber) return <Redirect href="/matches" />;
  const currentUser = user;

  async function saveMobileNumber() {
    const value = mobileNumber.trim();
    if (!value) return;

    setIsSaving(true);
    setError(undefined);
    try {
      await currentUser.update({
        unsafeMetadata: {
          ...currentUser.unsafeMetadata,
          [MOBILE_NUMBER_METADATA_KEY]: value,
        },
      });
      router.replace("/matches");
    } catch {
      setError(t("Could not save mobile number"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View className="flex-1 bg-background p-6" style={{ justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>{t("Complete your profile")}</Text>
      <Text className="text-foreground/60">{t("Add your mobile number to continue.")}</Text>
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "600" }}>{t("Mobile number")}</Text>
        <Input
          accessibilityLabel={t("Mobile number")}
          autoComplete="tel"
          keyboardType="phone-pad"
          onChangeText={setMobileNumber}
          testID="mobile-number-input"
          value={mobileNumber}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-danger">
          {error}
        </Text>
      ) : null}
      <Button
        variant="primary"
        isDisabled={isSaving || !mobileNumber.trim()}
        onPress={() => void saveMobileNumber()}
      >
        <Text className="text-primary-foreground">{isSaving ? t("Saving…") : t("Continue")}</Text>
      </Button>
    </View>
  );
}
