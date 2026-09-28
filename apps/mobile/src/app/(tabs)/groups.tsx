import { resolveApiUrl, useGroups } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Check,
  Crown,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  UsersRound,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);

export default function GroupsScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const t = useT();
  const feedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((value) => {
        if (active) setToken(value ?? null);
      })
      .catch(() => {
        if (active) setToken(null);
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn]);
  const groups = useGroups({ apiUrl, token, getToken, userId, feedback });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 12 }}>
        {groups.list.isPending
          ? [1, 2, 3].map((id) => (
              <Skeleton key={id} style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ))
          : null}
        {groups.list.isError ? (
          <Typography className="text-danger">{t("Could not load groups")}</Typography>
        ) : null}
        {groups.list.data?.length === 0 ? (
          <Typography className="text-muted">{t("No groups yet")}</Typography>
        ) : null}
        {groups.list.data?.map((group) => {
          const admin = group.adminUserId === userId;
          const invitation = group.invitations.find((item) => item.inviteeUserId === userId);
          return (
            <Card key={group.id} className="w-full p-3" style={{ width: "100%" }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t("Open group")}: ${group.name}`}
                onPress={() =>
                  router.push({ pathname: "/group/[groupId]", params: { groupId: group.id } })
                }
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View
                  className="bg-accent/10"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <UsersRound size={26} color="#006fee" />
                  {admin ? (
                    <View
                      accessible
                      accessibilityRole="image"
                      accessibilityLabel={t("Group admin")}
                      style={{ position: "absolute", top: 0, left: 0 }}
                    >
                      <Crown size={16} color="#f59e0b" />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Typography numberOfLines={1} style={{ flexShrink: 1, fontWeight: "600" }}>
                      {group.name}
                    </Typography>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      {group.isPublic ? (
                        <LockKeyholeOpen size={14} color="#6b7280" />
                      ) : (
                        <LockKeyhole size={14} color="#6b7280" />
                      )}
                      <Typography className="text-muted" style={{ fontSize: 12 }}>
                        {group.isPublic ? t("Public") : t("Private")}
                      </Typography>
                    </View>
                  </View>
                  <Typography className="text-muted" style={{ fontSize: 13 }}>
                    {group.memberCount} {group.memberCount === 1 ? t("member") : t("members")}
                  </Typography>
                  {admin && group.invitations.some((item) => item.status === "PENDING") ? (
                    <Typography className="text-muted" style={{ fontSize: 12 }}>
                      {group.invitations.filter((item) => item.status === "PENDING").length}{" "}
                      {t("Invited")}
                    </Typography>
                  ) : null}
                </View>
              </Pressable>
              {invitation?.status === "PENDING" ? (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    accessibilityLabel={t("Accept group invitation")}
                    isDisabled={groups.respond.isPending}
                    onPress={() =>
                      groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
                    }
                  >
                    <Check size={18} color="#17c964" />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    accessibilityLabel={t("Decline group invitation")}
                    isDisabled={groups.respond.isPending}
                    onPress={() =>
                      groups.respond.mutate({ invitationId: invitation.id, decision: "decline" })
                    }
                  >
                    <X size={18} color="#f31260" />
                  </Button>
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
      <Button
        isIconOnly
        variant="primary"
        accessibilityLabel={t("Create group")}
        testID="create-group-fab"
        onPress={() => router.push("/group/wizard")}
        style={{
          position: "absolute",
          right: 20,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Plus color="#fff" size={26} />
      </Button>
    </View>
  );
}
