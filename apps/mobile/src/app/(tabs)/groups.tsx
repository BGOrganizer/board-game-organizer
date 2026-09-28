import { resolveApiUrl, useGroups } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import squircles from "@dicebear/styles/squircles.json" with { type: "json" };
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Crown, LockKeyhole, LockKeyholeOpen, Mail, Plus, UsersRound } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { InvitationActions } from "@/components/InvitationActions";
import { LinkedListCard } from "@/components/LinkedListCard";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
const squirclesStyle = new Style(squircles);

function GroupArtwork({ name, admin }: { name: string; admin: boolean }) {
  const t = useT();
  const xml = useMemo(
    () => new DiceBearAvatar(squirclesStyle, { seed: name, size: 64 }).toString(),
    [name],
  );
  return (
    <View style={{ width: 64, height: 64, flexShrink: 0 }}>
      <View style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden" }}>
        <SvgXml xml={xml} width={64} height={64} />
      </View>
      {admin ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={t("Group admin")}
          className="bg-surface"
          style={{ position: "absolute", top: 0, left: 0, padding: 4, borderBottomRightRadius: 8 }}
        >
          <Crown size={16} color="#f59e0b" />
        </View>
      ) : null}
    </View>
  );
}

export default function GroupsScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const t = useT();
  const { i18n } = useLingui();
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
            <LinkedListCard
              key={group.id}
              label={`${t("Open group")}: ${group.name}`}
              onPress={() =>
                router.push({ pathname: "/group/[groupId]", params: { groupId: group.id } })
              }
              actions={
                invitation?.status === "PENDING" ? (
                  <InvitationActions
                    placement="card"
                    name={group.name}
                    pending={groups.respond.isPending}
                    onAccept={() =>
                      groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
                    }
                    onDecline={() =>
                      groups.respond.mutate({ invitationId: invitation.id, decision: "decline" })
                    }
                  />
                ) : undefined
              }
            >
              <GroupArtwork name={group.name} admin={admin} />
              <View
                style={{
                  flex: 1,
                  gap: 5,
                  paddingBottom: invitation?.status === "PENDING" ? 36 : 0,
                }}
              >
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
                  {new Date(group.createdAt).toLocaleDateString(i18n.locale, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Typography>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <UsersRound size={14} color="#6b7280" />
                  <Typography className="text-muted" style={{ fontSize: 13 }}>
                    {group.memberCount} {group.memberCount === 1 ? t("member") : t("members")}
                  </Typography>
                </View>
                {admin && group.invitations.some((item) => item.status === "PENDING") ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Mail size={14} color="#6b7280" />
                    <Typography className="text-muted" style={{ fontSize: 12 }}>
                      {group.invitations.filter((item) => item.status === "PENDING").length}{" "}
                      {t("Invited")}
                    </Typography>
                  </View>
                ) : null}
              </View>
            </LinkedListCard>
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
