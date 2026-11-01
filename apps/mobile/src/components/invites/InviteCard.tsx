import { useInvites } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Share, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

/**
 * Invite-a-friend card (mobile): a single button that generates a shareable
 * invite link (no email form) and opens the share sheet. The API builds the
 * link from the origin that received the request, so it always points at the
 * API (preview or production) that created it.
 */
export function InviteCard({ apiUrl, token }: { apiUrl: string; token: string | null }) {
  const { getToken } = useAuth();
  const t = useT();
  const accentForeground = useThemeColor("accent-foreground");
  const mutationFeedback = useMutationFeedback();
  const [link, setLink] = useState<string | null>(null);

  const create = useInvites({
    apiUrl,
    token,
    getToken,
    // The API builds the link from the origin that received the request, so
    // it always points at the API (preview or production) that created it.
    feedback: mutationFeedback,
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
            <Typography
              className="text-surface-foreground"
              style={{ fontSize: 14, fontWeight: "600" }}
            >
              {t("Invite a friend")}
            </Typography>
            <Typography className="text-muted" style={{ fontSize: 12 }}>
              {link ? link : t("Generate a link to connect with someone.")}
            </Typography>
          </View>
          <Button variant="primary" isDisabled={create.isPending} onPress={onCreate}>
            <UserPlus size={16} color={accentForeground} />
            <Button.Label>{t("Create invite")}</Button.Label>
          </Button>
        </>
      )}
      {create.isError && (
        <Typography className="text-danger" style={{ fontSize: 12 }}>
          {t("Could not create the invite. Try again.")}
        </Typography>
      )}
    </Card>
  );
}
