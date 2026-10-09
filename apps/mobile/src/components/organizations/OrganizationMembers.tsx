import type {
  OrganizationMemberResponse,
  OrganizationResponse,
} from "@board-game-organizer/schemas";
import {
  type ContactAction,
  communityAccessDenied,
  organizationMemberActions,
  organizationMemberContact,
  useOrganizationActions,
  useOrganizationPeople,
  useOrganizationSocialActions,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Ban,
  Check,
  CircleX,
  Clock3,
  Crown,
  Ellipsis,
  RotateCcw,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import {
  type UserActionConfirmation,
  UserActionsSheet,
} from "@/components/contacts/UserActionsSheet";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function OrganizationMembers({ organization }: { organization: OrganizationResponse }) {
  const t = useT();
  const options = useCommunityApi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const accentForeground = useThemeColor("accent-foreground");
  const muted = useThemeColor("muted");
  const danger = useThemeColor("danger");
  const warning = useThemeColor("warning");
  const actions = useOrganizationActions(options);
  const social = useOrganizationSocialActions(options);
  const busy = actions.busy || social.busy;
  const list = useOrganizationPeople(options, organization);
  const [removing, setRemoving] = useState<OrganizationMemberResponse | null>(null);
  const [menu, setMenu] = useState<{ userId: string; confirm?: UserActionConfirmation } | null>(
    null,
  );
  const canViewPeople = !communityAccessDenied(list.error);
  const selected = canViewPeople
    ? list.items.find((person) => person.userId === menu?.userId)
    : undefined;
  const run = (
    person: OrganizationMemberResponse,
    action: "remove" | "ban" | "revoke" | "approve" | "reject",
  ) => {
    if (busy) return;
    actions.membership.mutate(
      { id: organization.id, userId: person.userId, action },
      { onSuccess: () => setRemoving(null) },
    );
  };
  return (
    <>
      <FlatList
        testID="organization-members-scroll"
        style={{ flex: 1 }}
        data={canViewPeople ? list.items : []}
        keyExtractor={(person) => person.userId}
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          flexGrow: 1,
          paddingBottom: insets.bottom + 24,
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
            void list.fetchNextPage();
        }}
        ListHeaderComponent={
          organization.role === "admin" ? (
            <GroupedRow>
              <UserRoundPlus size={20} color={muted} />
              <Button
                variant="ghost"
                style={{ flex: 1, minHeight: 44, justifyContent: "flex-start" }}
                accessibilityLabel={t("Invite friends")}
                isDisabled={!organization.approved || busy || !canViewPeople}
                onPress={() =>
                  router.push({
                    pathname: "/organization/invite",
                    params: { organizationId: organization.id },
                  })
                }
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Typography className="text-muted">{t("Select a friend")}</Typography>
                  {!organization.approved ? (
                    <Typography className="text-xs text-muted">
                      {t("Invitations require an approved organization.")}
                    </Typography>
                  ) : null}
                </View>
              </Button>
            </GroupedRow>
          ) : null
        }
        ListEmptyComponent={
          list.isPending ? (
            <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
          ) : list.isError ? null : (
            <EmptyList icon={<UsersRound size={28} color={foreground} />}>
              {t("No members found")}
            </EmptyList>
          )
        }
        renderItem={({ item: person }) => {
          const name = person.name ?? person.username ?? t("Username unavailable");
          const user = organizationMemberContact(person);
          const pending = person.social?.friendRequest;
          const disabled = busy || !person.social;
          const memberActions = organizationMemberActions(organization, person);
          const friendLabel = user.isFriend
            ? t("Friends")
            : pending === "incoming"
              ? t("Respond to friend request")
              : pending === "outgoing"
                ? t("Cancel friend request")
                : t("Send friend request");
          const badge = person.isAdmin
            ? { Icon: Crown, label: t("Organization admin"), color: warning }
            : person.membership?.status === "PENDING"
              ? {
                  Icon: Clock3,
                  label:
                    person.membership.kind === "REQUEST" ? t("Membership requested") : t("Invited"),
                  color: warning,
                }
              : person.membership?.status === "EXCLUDED"
                ? { Icon: Ban, label: t("Excluded member"), color: danger }
                : null;
          const socialRun = (action: ContactAction) =>
            void social.run(person, action).catch(() => {});
          return (
            <GroupedRow>
              <View style={{ position: "relative" }}>
                <Avatar size="md" alt={name}>
                  <Avatar.Image source={{ uri: person.avatarUrl ?? undefined }} />
                  <Avatar.Fallback>{name.charAt(0)}</Avatar.Fallback>
                </Avatar>
                {badge ? (
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={badge.label}
                    className="bg-background"
                    style={{
                      position: "absolute",
                      right: -4,
                      bottom: -4,
                      borderRadius: 12,
                      padding: 2,
                    }}
                  >
                    <badge.Icon size={16} color={badge.color} />
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Typography className="font-semibold text-foreground" numberOfLines={1}>
                  {name}
                </Typography>
                {person.username && person.username !== name ? (
                  <Typography className="text-xs text-muted" numberOfLines={1}>
                    {person.username}
                  </Typography>
                ) : null}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  gap: 4,
                  maxWidth: 148,
                }}
              >
                {memberActions.includes("approve") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="primary"
                    style={{ minWidth: 44, minHeight: 44 }}
                    isDisabled={busy}
                    accessibilityLabel={`${t("Approve request")}: ${name}`}
                    onPress={() => run(person, "approve")}
                  >
                    <Check size={18} color={accentForeground} />
                  </Button>
                ) : null}
                {memberActions.includes("reject") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    style={{ minWidth: 44, minHeight: 44 }}
                    isDisabled={busy}
                    accessibilityLabel={`${t("Reject request")}: ${name}`}
                    onPress={() => run(person, "reject")}
                  >
                    <CircleX size={18} color={danger} />
                  </Button>
                ) : null}
                {memberActions.includes("remove") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    style={{ minWidth: 44, minHeight: 44 }}
                    isDisabled={busy}
                    accessibilityLabel={`${t("Remove member")}: ${name}`}
                    onPress={() => setRemoving(person)}
                  >
                    <UserRoundMinus size={18} color={danger} />
                  </Button>
                ) : null}
                {memberActions.includes("revoke") ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="primary"
                    style={{ minWidth: 44, minHeight: 44 }}
                    isDisabled={busy}
                    accessibilityLabel={`${t("Revoke exclusion")}: ${name}`}
                    onPress={() => run(person, "revoke")}
                  >
                    <RotateCcw size={18} color={accentForeground} />
                  </Button>
                ) : null}
                {person.userId !== options.userId ? (
                  <>
                    <Button
                      isIconOnly
                      size="sm"
                      variant={user.isFollowing ? "secondary" : "ghost"}
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={
                        disabled || user.blockedByMe || (user.blockedMe && !user.isFollowing)
                      }
                      accessibilityLabel={`${user.isFollowing ? t("Unfollow") : t("Follow")}: ${name}`}
                      onPress={() => socialRun(user.isFollowing ? "unfollow" : "follow")}
                    >
                      <UserRoundPlus size={18} color={foreground} />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant={user.isFriend ? "primary" : "ghost"}
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={disabled || user.isFriend || user.blockedByMe || user.blockedMe}
                      accessibilityLabel={`${friendLabel}: ${name}`}
                      onPress={() =>
                        setMenu({
                          userId: person.userId,
                          confirm:
                            pending === "incoming"
                              ? "respond_friend_request"
                              : pending === "outgoing"
                                ? "cancel_friend_request"
                                : "friend_request",
                        })
                      }
                    >
                      {user.isFriend ? (
                        <UserRoundCheck size={18} color={accentForeground} />
                      ) : pending ? (
                        <Clock3 size={18} color={foreground} />
                      ) : (
                        <UsersRound size={18} color={foreground} />
                      )}
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={disabled}
                      accessibilityLabel={`${t("Actions")}: ${name}`}
                      onPress={() => setMenu({ userId: person.userId })}
                    >
                      <Ellipsis size={18} color={muted} />
                    </Button>
                  </>
                ) : null}
              </View>
            </GroupedRow>
          );
        }}
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {list.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load organization members")}
                </Typography>
                <Button variant="outline" onPress={list.refetch}>
                  {t("Try again")}
                </Button>
              </>
            ) : null}
            {list.isFetchingNextPage || (list.isPending && list.items.length > 0) ? (
              <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
            ) : list.hasNextPage ? (
              <Button variant="outline" onPress={() => void list.fetchNextPage()}>
                {list.isFetchNextPageError
                  ? t("Could not load organization members. Retry")
                  : t("Load more")}
              </Button>
            ) : null}
          </View>
        }
      />
      {removing && canViewPeople && organization.role === "admin" ? (
        <CommunityConfirm
          title={t("Remove member")}
          description={t(
            "Before booking deadlines, reservations and demonstrator assignments are cancelled. Frozen participation and results remain. Remove allows new requests and invitations; Remove and exclude blocks rejoining this organization until revoked. Global social blocking is separate.",
          )}
          busy={busy}
          onCancel={() => {
            if (!busy) setRemoving(null);
          }}
          actions={[
            {
              label: t("Remove from organization"),
              variant: "danger",
              onPress: () => run(removing, "remove"),
            },
            {
              label: t("Remove and exclude"),
              variant: "danger",
              onPress: () => run(removing, "ban"),
            },
          ]}
        />
      ) : null}
      <UserActionsSheet
        visible={Boolean(menu && selected)}
        user={selected ? organizationMemberContact(selected) : null}
        busy={busy}
        blockLabel={t("Block user globally")}
        canSendFriendRequest={Boolean(
          selected?.social &&
            !selected.social.isFriend &&
            !selected.social.friendRequest &&
            !selected.social.blockedByMe,
        )}
        friendRequest={selected?.social?.friendRequest}
        initialConfirmAction={menu?.confirm}
        onClose={() => setMenu(null)}
        onAction={async (action) => {
          if (selected && action !== "profile") await social.run(selected, action);
        }}
      />
    </>
  );
}
