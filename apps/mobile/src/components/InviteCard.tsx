import { useInvites } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Skeleton } from "heroui-native/skeleton";
import { UserPlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Share, Text, View } from "react-native";
import { useT } from "@/lib/i18n";

/**
 * Invite-a-friend card (mobile): a single button that generates a shareable
 * invite link (no email form) and opens the share sheet. The link points at
 * the web origin matching the API this app talks to (EXPO_PUBLIC_WEB_ORIGIN,
 * defaulting to the production web).
 */
export function InviteCard({ apiUrl, token }: { apiUrl: string; token: string | null }) {
  const { getToken } = useAuth();
  const t = useT();
  const [link, setLink] = useState<string | null>(null);

  const create = useInvites({
    apiUrl,
    token,
    getToken,
    // Expo inlines EXPO_PUBLIC_* in project files; default to production web.
    webOrigin: process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://web-rosy-phi-82.vercel.app",
  });

  const share = async (text: string) => {
    try {
      await Share.share({ message: text });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  };

  const onCreate = () => {
    create.mutate(undefined, {
      onSuccess: (row) => {
        setLink(row.link);
        share(row.link);
      },
    });
  };

  return (
    <Card
      style={{
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
      }}
    >
      {create.isPending ? (
        <View style={{ gap: 6, flex: 1 }}>
          <Skeleton
            isLoading
            variant="pulse"
            style={{ width: "60%", height: 14, borderRadius: 4 }}
          />
          <Skeleton
            isLoading
            variant="pulse"
            style={{ width: "40%", height: 12, borderRadius: 4 }}
          />
        </View>
      ) : (
        <>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: "600" }}>{t("Invite a friend")}</Text>
            <Text style={{ fontSize: 12, color: "#8e8e93" }}>
              {link ? link : t("Generate a link to connect with someone.")}
            </Text>
          </View>
          <Button variant="primary" isDisabled={create.isPending} onPress={onCreate}>
            <UserPlus size={16} color="#fff" />
            <Text>{t("Create invite")}</Text>
          </Button>
        </>
      )}
      {create.isError && (
        <Text style={{ fontSize: 12, color: "#f31260" }}>
          {t("Could not create the invite. Try again.")}
        </Text>
      )}
    </Card>
  );
}
