import { resolveApiUrl, useContacts, useGroups } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Check,
  Crown,
  LockKeyhole,
  LockKeyholeOpen,
  LogOut,
  Pencil,
  Trash2,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);

export default function GroupDetailScreen() {
  const { groupId: value } = useLocalSearchParams<{ groupId: string | string[] }>();
  const groupId = Array.isArray(value) ? value[0] : value;
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const t = useT();
  const feedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((next) => {
        if (active) setToken(next ?? null);
      })
      .catch(() => {
        if (active) setToken(null);
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn]);
  const groups = useGroups({ apiUrl, token, getToken, userId, feedback });
  const contacts = useContacts(apiUrl, token, getToken, undefined, userId, feedback);
  const group = groups.list.data?.find((candidate) => candidate.id === groupId);
  const admin = group?.adminUserId === userId;
  const invitation = group?.invitations.find((candidate) => candidate.inviteeUserId === userId);
  const confirm = (action: "delete" | "leave") => {
    Alert.alert(
      action === "delete" ? t("Delete group?") : t("Leave group?"),
      action === "delete"
        ? t("Group will be archived. Existing confirmed match results and ratings remain.")
        : t("You will need a new invitation to rejoin."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: action === "delete" ? t("Delete group") : t("Leave group"),
          style: "destructive",
          onPress: async () => {
            try {
              if (action === "delete") await groups.archive.mutateAsync(groupId);
              else await groups.leave.mutateAsync(groupId);
              router.back();
            } catch {
              // Shared mutation feedback shows failure.
            }
          },
        },
      ],
    );
  };
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: group?.name ?? t("Group") }} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {groups.list.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : null}
        {!groups.list.isPending && !group ? (
          <Typography className="text-danger">{t("Could not load group details")}</Typography>
        ) : null}
        {group ? (
          <>
            <Typography style={{ fontSize: 20, fontWeight: "600" }}>{group.name}</Typography>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {group.isPublic ? (
                <LockKeyholeOpen size={16} color="#6b7280" />
              ) : (
                <LockKeyhole size={16} color="#6b7280" />
              )}
              <Typography className="text-muted">
                {group.isPublic ? t("Public") : t("Private")}
              </Typography>
              <Typography className="text-muted">
                · {group.memberCount} {group.memberCount === 1 ? t("member") : t("members")}
              </Typography>
            </View>
            <Typography style={{ fontWeight: "600" }}>{t("Members")}</Typography>
            {invitation?.status === "PENDING" ? (
              <Typography className="text-muted">
                {t("Members are visible after accepting the invitation")}
              </Typography>
            ) : null}
            <GroupedList>
              {group.memberProfiles.map((member) => (
                <GroupedRow key={member.id}>
                  <Avatar size="md">
                    {member.avatarUrl ? <Avatar.Image source={{ uri: member.avatarUrl }} /> : null}
                    <Avatar.Fallback>{member.name.charAt(0) || "?"}</Avatar.Fallback>
                  </Avatar>
                  <Typography style={{ flex: 1 }}>{member.name}</Typography>
                  {member.id === group.adminUserId ? (
                    <View
                      accessible
                      accessibilityRole="image"
                      accessibilityLabel={t("Group admin")}
                    >
                      <Crown size={16} color="#f59e0b" />
                    </View>
                  ) : null}
                </GroupedRow>
              ))}
            </GroupedList>
            {admin ? (
              <View style={{ gap: 8 }}>
                <Typography style={{ fontWeight: "600" }}>{t("Invitations")}</Typography>
                {contacts.friends.isPending ? (
                  <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
                ) : null}
                {contacts.friends.isError ? (
                  <Typography className="text-danger">{t("Could not load friends")}</Typography>
                ) : null}
                {group.invitations.every((item) => item.status === "ACCEPTED") ? (
                  <Typography className="text-muted">{t("No invitations")}</Typography>
                ) : null}
                <GroupedList>
                  {group.invitations
                    .filter((item) => item.status !== "ACCEPTED")
                    .map((item) => {
                      const user = contacts.friends.data?.find(
                        (friend) => friend.profile?.id === item.inviteeUserId,
                      )?.profile;
                      return (
                        <GroupedRow key={item.id}>
                          <Avatar size="md">
                            {user?.avatarUrl ? (
                              <Avatar.Image source={{ uri: user.avatarUrl }} />
                            ) : null}
                            <Avatar.Fallback>{user?.name.charAt(0) ?? "?"}</Avatar.Fallback>
                          </Avatar>
                          <Typography style={{ flex: 1 }}>
                            {user?.name ?? item.inviteeUserId}
                          </Typography>
                          <Typography className="text-muted">
                            {item.status === "PENDING" ? t("Pending") : t("Declined")}
                          </Typography>
                        </GroupedRow>
                      );
                    })}
                </GroupedList>
              </View>
            ) : null}
            {admin && group.invitations.some((item) => item.status === "PENDING") ? (
              <Typography className="text-muted">
                {group.invitations.filter((item) => item.status === "PENDING").length}{" "}
                {t("Invited")}
              </Typography>
            ) : null}
            {invitation?.status === "PENDING" ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button
                  variant="primary"
                  isDisabled={groups.respond.isPending}
                  onPress={() =>
                    groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
                  }
                >
                  <Check size={16} color="#fff" />
                  <Typography className="text-white">{t("Accept invitation")}</Typography>
                </Button>
                <Button
                  variant="danger-soft"
                  isDisabled={groups.respond.isPending}
                  onPress={() =>
                    groups.respond.mutate(
                      { invitationId: invitation.id, decision: "decline" },
                      { onSuccess: () => router.back() },
                    )
                  }
                >
                  <X size={16} color="#dc2626" />
                  <Typography className="text-danger">{t("Decline invitation")}</Typography>
                </Button>
              </View>
            ) : null}
            {admin ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button
                  variant="primary"
                  accessibilityLabel={t("Edit group")}
                  onPress={() => router.push({ pathname: "/group/wizard", params: { groupId } })}
                >
                  <Pencil size={16} color="#fff" />
                  <Typography className="text-white">{t("Edit group")}</Typography>
                </Button>
                <Button
                  variant="danger-soft"
                  accessibilityLabel={t("Delete group")}
                  isDisabled={groups.archive.isPending}
                  onPress={() => confirm("delete")}
                >
                  <Trash2 size={16} color="#dc2626" />
                  <Typography className="text-danger">{t("Delete group")}</Typography>
                </Button>
              </View>
            ) : invitation?.status === "ACCEPTED" ? (
              <Button
                variant="danger-soft"
                accessibilityLabel={t("Leave group")}
                isDisabled={groups.leave.isPending}
                onPress={() => confirm("leave")}
              >
                <LogOut size={16} color="#dc2626" />
                <Typography className="text-danger">{t("Leave group")}</Typography>
              </Button>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
