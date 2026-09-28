import {
  matchContactState,
  resolveApiUrl,
  useContacts,
  useGroups,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Popover } from "heroui-native/popover";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  Crown,
  Ellipsis,
  LockKeyhole,
  LockKeyholeOpen,
  LogOut,
  Pencil,
  Trash2,
  UserRoundX,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { UserActionsSheet } from "@/components/UserActionsSheet";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import type { UserActionKey } from "@/lib/user-actions";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);

export default function GroupDetailScreen() {
  const { groupId: value } = useLocalSearchParams<{ groupId: string | string[] }>();
  const groupId = Array.isArray(value) ? value[0] : value;
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const t = useT();
  const feedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
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
  const people = group
    ? [
        ...group.memberProfiles.map((person) => ({
          ...person,
          status: "ACCEPTED" as const,
          invitation: group.invitations.find((item) => item.inviteeUserId === person.id),
        })),
        ...group.invitations
          .filter((item) => item.status !== "ACCEPTED")
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
            try {
              if (action === "delete") await groups.archive.mutateAsync(id);
              else await groups.leave.mutateAsync(id);
              router.back();
            } catch {
              // Shared mutation feedback shows failure.
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
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Button
          isIconOnly
          variant="ghost"
          accessibilityLabel={t("Back")}
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color="#737373" />
        </Button>
        <Typography className="flex-1 font-semibold text-foreground" numberOfLines={1}>
          {group?.name ?? t("Group")}
        </Typography>
        {admin ? (
          <Popover isOpen={moreActionsOpen} onOpenChange={setMoreActionsOpen}>
            <Popover.Trigger asChild>
              <Button
                isIconOnly
                size="sm"
                variant="outline"
                accessibilityLabel={t("More group actions")}
                style={{ minHeight: 44, minWidth: 44 }}
              >
                <Ellipsis size={18} color="#737373" />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Overlay />
              <Popover.Content
                presentation="popover"
                placement="bottom"
                width={220}
                style={{ gap: 8, padding: 8 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    accessibilityLabel={t("Delete group")}
                    isDisabled={groups.archive.isPending}
                    style={{ minWidth: 44, minHeight: 44 }}
                    onPress={() => {
                      setMoreActionsOpen(false);
                      confirm("delete");
                    }}
                  >
                    <Trash2 size={18} color="#f31260" />
                  </Button>
                  <Typography className="text-danger">{t("Delete group")}</Typography>
                </View>
              </Popover.Content>
            </Popover.Portal>
          </Popover>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, gap: 16 }}>
        {groups.list.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : null}
        {!groups.list.isPending && !group ? (
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
              <Typography className="text-muted">
                {t("Members are visible after accepting the invitation")}
              </Typography>
            ) : null}
            {contacts.friends.isPending && admin ? (
              <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
            ) : null}
            {contacts.friends.isError && admin ? (
              <Typography className="text-danger">{t("Could not load friends")}</Typography>
            ) : null}
            <GroupedList>
              {people.map((person) => (
                <GroupedRow key={person.id}>
                  <View style={{ position: "relative" }}>
                    <Avatar size="md">
                      {person.avatarUrl ? (
                        <Avatar.Image source={{ uri: person.avatarUrl }} />
                      ) : null}
                      <Avatar.Fallback>{person.name.charAt(0) || "?"}</Avatar.Fallback>
                    </Avatar>
                    <View
                      accessible
                      accessibilityRole="image"
                      className="bg-background"
                      accessibilityLabel={
                        person.status === "PENDING"
                          ? t("Pending")
                          : person.status === "DECLINED"
                            ? t("Declined")
                            : t("Accepted")
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
                      ) : person.status === "DECLINED" ? (
                        <CircleX size={15} color="#f31260" />
                      ) : (
                        <CircleCheck size={15} color="#17c964" />
                      )}
                    </View>
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
                    <Typography className="font-medium text-foreground" numberOfLines={1}>
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
            {socialQueries.some((query) => query.isError) ? (
              <Button
                variant="ghost"
                accessibilityLabel={t("Could not load social actions. Retry")}
                onPress={() => void contacts.refreshContacts()}
              >
                <Typography>{t("Could not load social actions. Retry")}</Typography>
              </Button>
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
            {!admin && invitation?.status === "ACCEPTED" ? (
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
      {admin ? (
        <Button
          isIconOnly
          variant="primary"
          accessibilityLabel={t("Edit group")}
          style={{
            position: "absolute",
            right: 20,
            bottom: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
          }}
          onPress={() => router.push({ pathname: "/group/wizard", params: { groupId } })}
        >
          <Pencil size={24} color="#fff" />
        </Button>
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
