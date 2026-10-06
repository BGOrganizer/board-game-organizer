import {
  matchContactState,
  resolveApiUrl,
  useContacts,
  useGroups,
} from "@board-game-organizer/shared";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import {
  CircleX,
  Clock3,
  Crown,
  Ellipsis,
  LockKeyhole,
  LockKeyholeOpen,
  LogOut,
  Mail,
  Pencil,
  Trash2,
  UserRoundX,
  UsersRound,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyList } from "@/components/EmptyList";
import { FloatingActions } from "@/components/FloatingActions";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { GroupLeaderboard } from "@/components/GroupLeaderboard";
import { InvitationActions } from "@/components/InvitationActions";
import { UserActionsSheet } from "@/components/UserActionsSheet";
import { floatingActionLayout } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import type { UserActionKey } from "@/lib/user-actions";
import { useSessionAuth } from "@/lib/useSessionAuth";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);

export default function GroupDetailScreen() {
  const { groupId: value } = useLocalSearchParams<{ groupId: string | string[] }>();
  const groupId = Array.isArray(value) ? value[0] : value;
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const router = useRouter();
  const t = useT();
  const feedback = useMutationFeedback();
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("settings");
  const [exiting, setExiting] = useState(false);
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
  const groups = useGroups({ apiUrl, token, getToken, userId, feedback, groupId });
  const contacts = useContacts(apiUrl, token, getToken, undefined, userId, feedback);
  const group = groups.detail.data?.group;
  const admin = Boolean(group && group.adminUserId === userId);
  const invitation = group?.invitations.find((candidate) => candidate.inviteeUserId === userId);
  const people = group
    ? [
        ...group.memberProfiles.map((person) => ({
          ...person,
          status: "ACCEPTED" as const,
          invitation: group.invitations.find((item) => item.inviteeUserId === person.id),
        })),
        ...group.invitations
          .filter((item) => admin && item.status !== "ACCEPTED")
          .map((item) => {
            const friend = contacts.friends.data?.find(
              (row) => row.profile?.id === item.inviteeUserId,
            )?.profile;
            return {
              id: item.inviteeUserId,
              name: friend?.name ?? item.inviteeUserId,
              email: friend?.email ?? null,
              avatarUrl: friend?.avatarUrl ?? null,
              status: item.status,
              invitation: item,
            };
          }),
      ]
    : [];
  const socialLists = {
    following: contacts.following.data,
    followers: contacts.followers.data,
    friends: contacts.friends.data,
    pending: contacts.pending.data,
    sent: contacts.sent.data,
    blocked: contacts.blocked.data,
  };
  const selectedPerson = people.find((person) => person.id === menuUserId);
  const selectedContact = selectedPerson ? matchContactState(selectedPerson, socialLists) : null;
  const socialQueries = [
    contacts.following,
    contacts.followers,
    contacts.friends,
    contacts.pending,
    contacts.sent,
    contacts.blocked,
  ];
  const socialBusy =
    !socialQueries.every((query) => query.isSuccess) ||
    [
      contacts.follow,
      contacts.unfollow,
      contacts.unfriend,
      contacts.friendRequest,
      contacts.cancelFriendRequest,
      contacts.acceptFriendRequest,
      contacts.rejectFriendRequest,
      contacts.block,
      contacts.unblock,
    ].some((mutation) => mutation.isPending);
  const socialAction = async (key: UserActionKey) => {
    if (!selectedContact || key === "profile") return;
    const mutation = {
      follow: contacts.follow,
      unfollow: contacts.unfollow,
      unfriend: contacts.unfriend,
      friend_request: contacts.friendRequest,
      cancel_friend_request: contacts.cancelFriendRequest,
      accept_friend_request: contacts.acceptFriendRequest,
      reject_friend_request: contacts.rejectFriendRequest,
      block: contacts.block,
      unblock: contacts.unblock,
    }[key];
    if (mutation)
      await mutation.mutateAsync({
        targetUserId: selectedContact.user.id,
        targetUser: selectedContact.user,
      });
  };
  const confirm = (action: "delete" | "leave", id = groupId) => {
    if (groups.archive.isPending || groups.leave.isPending) return;
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
            setExiting(true);
            try {
              if (action === "delete") await groups.archive.mutateAsync(id);
              else await groups.leave.mutateAsync(id);
              router.back();
            } catch {
              setExiting(false); // Shared mutation feedback shows failure.
            }
          },
        },
      ],
    );
  };
  const remove = (id: string) => {
    if (groups.removeInvitation.isPending) return;
    Alert.alert(
      t("Remove from group?"),
      t("This removes the invitation or member from the group. You can invite them again."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Remove from group"),
          style: "destructive",
          onPress: () =>
            void groups.removeInvitation.mutateAsync(id).catch(() => {
              // Shared mutation feedback shows failure and rolls back.
            }),
        },
      ],
    );
  };
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t("Group details"),
          headerRight: admin
            ? () => (
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  accessibilityLabel={t("Delete group")}
                  isDisabled={groups.archive.isPending}
                  style={{ minWidth: 44, minHeight: 44 }}
                  onPress={() => confirm("delete")}
                >
                  <Trash2 size={18} color="#f31260" />
                </Button>
              )
            : invitation?.status === "ACCEPTED"
              ? () => (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    accessibilityLabel={t("Leave group")}
                    isDisabled={groups.leave.isPending}
                    style={{ minWidth: 44, minHeight: 44 }}
                    onPress={() => confirm("leave")}
                  >
                    <LogOut size={18} color="#dc2626" />
                  </Button>
                )
              : undefined,
        }}
      />
      <View style={{ flex: 1, padding: 16 }}>
        <Tabs value={activeTab} onValueChange={setActiveTab} variant="primary" style={{ flex: 1 }}>
          <Tabs.List>
            <Tabs.Indicator />
            <Tabs.Trigger value="settings" style={{ flex: 1 }}>
              <Tabs.Label>{t("Settings")}</Tabs.Label>
            </Tabs.Trigger>
            {admin || invitation?.status === "ACCEPTED" ? (
              <Tabs.Trigger value="leaderboard" style={{ flex: 1 }}>
                <Tabs.Label>{t("Leaderboards")}</Tabs.Label>
              </Tabs.Trigger>
            ) : null}
          </Tabs.List>
          <Tabs.Content value="settings" style={{ flex: 1, marginTop: 12 }}>
            <ScrollView
              testID="group-detail-scroll"
              style={{ flex: 1 }}
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={{
                paddingBottom: floatingActionLayout(insets.bottom, 100).paddingBottom,
                gap: 16,
              }}
            >
              {groups.detail.isPending || (exiting && !group) ? (
                <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
              ) : null}
              {!groups.detail.isPending && !group && !exiting ? (
                <Typography className="text-danger">{t("Could not load group details")}</Typography>
              ) : null}
              {group ? (
                <>
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
                  {invitation?.status === "PENDING" ? (
                    <Card
                      style={{
                        position: "relative",
                        width: "100%",
                        minHeight: 56,
                        padding: 12,
                        paddingRight: 100,
                        borderRadius: 12,
                      }}
                    >
                      <Typography className="font-medium text-foreground">
                        {t("Your invitation is waiting for a response.")}
                      </Typography>
                      <InvitationActions
                        placement="detail"
                        pending={groups.respond.isPending}
                        onAccept={() =>
                          groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
                        }
                        onDecline={() => {
                          setExiting(true);
                          groups.respond.mutate(
                            { invitationId: invitation.id, decision: "decline" },
                            { onSuccess: () => router.back(), onError: () => setExiting(false) },
                          );
                        }}
                      />
                    </Card>
                  ) : null}
                  {contacts.friends.isPending && admin ? (
                    <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
                  ) : null}
                  {contacts.friends.isError && admin ? (
                    <Typography className="text-danger">{t("Could not load friends")}</Typography>
                  ) : null}
                  {[
                    {
                      id: "members",
                      title: t("Members"),
                      icon: UsersRound,
                      rows: people.filter((p) => p.status === "ACCEPTED"),
                    },
                    ...(admin
                      ? [
                          {
                            id: "invitations",
                            title: t("Invitations"),
                            icon: Mail,
                            rows: people.filter((p) => p.status !== "ACCEPTED"),
                          },
                        ]
                      : []),
                  ].map((section) => (
                    <View key={section.id} style={{ gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <section.icon size={18} color="#737373" />
                        <Typography
                          accessibilityRole="header"
                          className="font-semibold text-foreground"
                        >
                          {section.title}
                        </Typography>
                      </View>
                      {section.rows.length > 0 ? (
                        <GroupedList>
                          {section.rows.map((person) => (
                            <GroupedRow key={person.id}>
                              <View style={{ position: "relative" }}>
                                <Avatar size="md">
                                  {person.avatarUrl ? (
                                    <Avatar.Image source={{ uri: person.avatarUrl }} />
                                  ) : null}
                                  <Avatar.Fallback>{person.name.charAt(0) || "?"}</Avatar.Fallback>
                                </Avatar>
                                {person.status !== "ACCEPTED" ? (
                                  <View
                                    accessible
                                    accessibilityRole="image"
                                    className="bg-background"
                                    accessibilityLabel={
                                      person.status === "PENDING" ? t("Pending") : t("Declined")
                                    }
                                    style={{
                                      position: "absolute",
                                      right: -4,
                                      bottom: -4,
                                      borderRadius: 12,
                                      padding: 2,
                                    }}
                                  >
                                    {person.status === "PENDING" ? (
                                      <Clock3 size={15} color="#f5a524" />
                                    ) : (
                                      <CircleX size={15} color="#f31260" />
                                    )}
                                  </View>
                                ) : null}
                                {person.id === group.adminUserId ? (
                                  <View
                                    accessible
                                    accessibilityRole="image"
                                    accessibilityLabel={t("Group admin")}
                                    className="bg-surface"
                                    style={{
                                      position: "absolute",
                                      top: 0,
                                      left: 0,
                                      borderBottomRightRadius: 8,
                                      padding: 2,
                                    }}
                                  >
                                    <Crown size={16} color="#f5a524" />
                                  </View>
                                ) : null}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Typography
                                  className="font-medium text-foreground"
                                  numberOfLines={1}
                                >
                                  {person.name}
                                </Typography>
                                {person.email ? (
                                  <Typography className="text-sm text-muted" numberOfLines={1}>
                                    {person.email}
                                  </Typography>
                                ) : null}
                              </View>
                              {admin && person.invitation ? (
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="danger-soft"
                                  isDisabled={groups.removeInvitation.isPending}
                                  accessibilityLabel={`${t("Remove from group")}: ${person.name}`}
                                  style={{ minHeight: 44, minWidth: 44 }}
                                  onPress={() => remove(person.invitation?.id ?? "")}
                                >
                                  <UserRoundX size={18} color="#f31260" />
                                </Button>
                              ) : null}
                              {person.id !== userId ? (
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="ghost"
                                  accessibilityLabel={`${t("Actions")}: ${person.name}`}
                                  style={{ minHeight: 44, minWidth: 44 }}
                                  onPress={() => setMenuUserId(person.id)}
                                >
                                  <Ellipsis size={18} color="#737373" />
                                </Button>
                              ) : null}
                            </GroupedRow>
                          ))}
                        </GroupedList>
                      ) : section.id === "invitations" ? (
                        <EmptyList icon={<Mail size={28} color="#737373" />}>
                          {t("No invitations")}
                        </EmptyList>
                      ) : null}
                    </View>
                  ))}
                  {socialQueries.some((query) => query.isError) ? (
                    <Button
                      variant="ghost"
                      accessibilityLabel={t("Could not load social actions. Retry")}
                      onPress={() => void contacts.refreshContacts()}
                    >
                      <Typography>{t("Could not load social actions. Retry")}</Typography>
                    </Button>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </Tabs.Content>
          {(admin || invitation?.status === "ACCEPTED") && group ? (
            <Tabs.Content value="leaderboard" style={{ flex: 1, marginTop: 12 }}>
              <GroupLeaderboard groupId={group.id} />
            </Tabs.Content>
          ) : null}
        </Tabs>
      </View>
      {admin && activeTab === "settings" ? (
        <FloatingActions
          label="Edit group"
          testID="edit-group-fab"
          onPress={() => router.push({ pathname: "/group/wizard", params: { groupId } })}
          extraBottom={100}
          variant="primary"
        >
          <Pencil color="#fff" size={26} />
        </FloatingActions>
      ) : null}
      <UserActionsSheet
        visible={selectedContact !== null}
        user={selectedContact?.user ?? null}
        busy={socialBusy}
        canSendFriendRequest={selectedContact?.canSendFriendRequest}
        friendRequest={selectedContact?.friendRequest}
        matchContext
        onClose={() => setMenuUserId(null)}
        onAction={socialAction}
      />
    </View>
  );
}
