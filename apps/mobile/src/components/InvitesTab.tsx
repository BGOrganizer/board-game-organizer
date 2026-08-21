import { useInvites } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Share, Text, View } from "react-native";
import { useT } from "@/lib/i18n";

/**
 * Invites section (mobile): create a shareable invite, list my invites,
 * claim one by pasting a link/token.
 */
export function InvitesTab({
  apiUrl,
  protectionBypass,
  token,
  getToken,
}: {
  apiUrl: string;
  protectionBypass?: string | null;
  token: string | null;
  getToken: () => Promise<string | null>;
}) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [claimInput, setClaimInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const { invites, create, claim } = useInvites({
    apiUrl,
    token,
    getToken,
    protectionBypass,
  });

  const shareLink = useCallback(async (link: string) => {
    try {
      await Share.share({ message: link });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }, []);

  const onCreate = () => {
    create.mutate({ email: email.trim() || undefined }, { onSuccess: () => setEmail("") });
  };

  const onClaim = () => {
    setMessage(null);
    claim.mutate(
      { inviteLinkOrToken: claimInput },
      {
        onSuccess: (res) => {
          setClaimInput("");
          setMessage(
            res.autoAccepted
              ? t("Invite claimed — you are now friends!")
              : t("Invite claimed — you now follow the inviter."),
          );
        },
        onError: () => setMessage(t("Could not claim this invite.")),
      },
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ padding: 12, gap: 8 }}>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder={t("Optional email (auto-connect on claim)")}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Button variant="primary" isDisabled={create.isPending} onPress={onCreate}>
          <Text>{t("Create invite")}</Text>
        </Button>
        {create.isError && (
          <Text style={{ fontSize: 13, color: "#f31260" }}>
            {t("Could not create the invite. Try again.")}
          </Text>
        )}
        {create.data && (
          <View
            style={{
              backgroundColor: "rgba(120,120,128,0.12)",
              borderRadius: 8,
              padding: 10,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 12 }} numberOfLines={3}>
              {create.data.link}
            </Text>
            <Button variant="outline" size="sm" onPress={() => shareLink(create.data.link)}>
              <Text>{t("Share link")}</Text>
            </Button>
          </View>
        )}
      </Card>

      <Card style={{ padding: 12, gap: 8 }}>
        <Input
          value={claimInput}
          onChangeText={setClaimInput}
          placeholder={t("Paste an invite link or token to claim it")}
          autoCapitalize="none"
        />
        <Button
          variant="primary"
          isDisabled={claim.isPending || !claimInput.trim()}
          onPress={onClaim}
        >
          <Text>{t("Claim")}</Text>
        </Button>
        {message && <Text style={{ fontSize: 13, color: "#17c964" }}>{message}</Text>}
      </Card>

      {invites.isLoading && (
        <View style={{ gap: 8 }}>
          {[0, 1, 2].map((n) => (
            <View
              key={n}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 12,
                width: "100%",
                backgroundColor: "rgba(120,120,128,0.12)",
              }}
            >
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton
                  isLoading
                  variant="pulse"
                  style={{ width: "70%", height: 14, borderRadius: 4 }}
                />
                <Skeleton
                  isLoading
                  variant="pulse"
                  style={{ width: "45%", height: 12, borderRadius: 4 }}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {!invites.isLoading && (invites.data?.invites.length ?? 0) === 0 && (
        <Text style={{ fontSize: 13, color: "#8e8e93" }}>
          {t("No invites yet — create one to share.")}
        </Text>
      )}

      <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ gap: 8 }}>
          {invites.data?.invites.map((invite) => (
            <Card
              key={invite.token}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 12,
                width: "100%",
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 12 }} numberOfLines={1}>
                  {invite.link}
                </Text>
                <Text style={{ fontSize: 11, color: "#8e8e93" }}>
                  {invite.status} · {new Date(invite.expiresAt).toLocaleDateString()}
                  {invite.email ? ` · ${invite.email}` : ""}
                </Text>
              </View>
              <Button variant="outline" size="sm" onPress={() => shareLink(invite.link)}>
                <Text>{t("Share")}</Text>
              </Button>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
