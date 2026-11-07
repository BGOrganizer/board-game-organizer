import {
  type GroupPersonResponse,
  type GroupRecordResponse,
  notificationItemId,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  groupPersonActions,
  groupPersonContact,
  isGroupManagerRole,
  isGroupModerator,
  useGroupMemberManagement,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useFocusEffect, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Ban,
  Check,
  ClipboardCheck,
  Clock3,
  Crown,
  EllipsisVertical,
  RotateCcw,
  ShieldCheck,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type FlatListProps, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { GroupBanDialog } from "@/components/common/ui/GroupBanDialog";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { UserActionsSheet } from "@/components/common/ui/UserActionsSheet";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupMemberActions } from "./GroupMemberActions";
import { GroupMemberAttention } from "./GroupMemberAttention";
export function GroupMembers({ group }: { group: GroupRecordResponse }) {
  const t = useT(),
    options = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    { i18n } = useLingui();
  const [foreground, muted, danger, accent, dangerForeground] = useThemeColor([
    "foreground",
    "muted",
    "danger",
    "accent-foreground",
    "danger-foreground",
  ]);
  const workflow = useGroupMemberManagement(options, group),
    { list, busy } = workflow;
  const [menu, setMenu] = useState<string | null>(null);
  const [staffMenu, setStaffMenu] = useState<string | null>(null);
  const [focused, setFocused] = useState(false),
    [active, setActive] = useState(AppState.currentState === "active");
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 100 }).current;
  const onViewableItemsChanged = useCallback<
    NonNullable<FlatListProps<GroupPersonResponse>["onViewableItemsChanged"]>
  >(
    ({ viewableItems }) =>
      setVisibleIds(
        new Set(viewableItems.filter((row) => row.isViewable).map((row) => row.item.userId)),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  const denied = communityAccessDenied(list.error),
    managed = denied ? null : workflow.managed;
  const selected =
    group.canSocialInteract && !denied
      ? list.items.find((person) => person.userId === menu && person.social)
      : undefined;
  const name = (person: GroupPersonResponse) =>
    person.name ?? person.username ?? t("Username unavailable");
  const failure = workflow.error
    ? workflow.error.message === "BAN_FROZEN_PARTICIPATION"
      ? t("This user is involved in a frozen public event and cannot be excluded.")
      : t("Could not update group member. Try again or refresh the list.")
    : undefined;
  const roleChange = managed?.action === "promote" || managed?.action === "demote";
  const roleLabel = managed?.action === "promote" ? t("Make moderator") : t("Demote to member");
  return (
    <NotificationAttentionScope
      options={options}
      targets={(denied ? [] : list.items)
        .filter((person) => person.membership?.status === "ACCEPTED")
        .map((person) => ({
          kind: "item" as const,
          id: notificationItemId(group.id, "member", person.userId),
        }))}
    >
      <UserList
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        testID="group-members-scroll"
        data={denied ? [] : list.items}
        pages={[{ ...list, isLoading: list.isPending }]}
        keyExtractor={(person) => person.userId}
        contentContainerStyle={{
          padding: 20,
          paddingTop: 0,
          flexGrow: 1,
          paddingBottom: insets.bottom + 24,
        }}
        empty={t("No members found")}
        emptyIcon={<UsersRound size={28} color={foreground} />}
        error={t("Could not load group members")}
        skeleton={<Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />}
        header={
          isGroupManagerRole(group.role) ? (
            <View style={{ gap: 12 }}>
              <AddUserRow
                label={t("Invite friends")}
                isDisabled={!group.canInvite || workflow.blocking || denied}
                onPress={() =>
                  router.push({ pathname: "/group/invite", params: { groupId: group.id } })
                }
                actions={
                  !group.canInvite ? (
                    <HelpPopover label={t("Invitations unavailable")} title={t("Invite friends")}>
                      <Typography className="text-foreground">
                        {t("Invitations require an approved group.")}
                      </Typography>
                    </HelpPopover>
                  ) : undefined
                }
              />
            </View>
          ) : undefined
        }
        renderRow={(person) => {
          const allowed = groupPersonActions(group, person);
          const badge = person.optimisticInvited
            ? { icon: Clock3, label: t("Sending invitation"), color: "warning" as const }
            : person.isAdmin
              ? { icon: Crown, label: t("Group admin"), color: "warning" as const }
              : person.ban
                ? { icon: Ban, label: t("Excluded from group"), color: "danger" as const }
                : person.membership?.status === "PENDING"
                  ? {
                      icon: person.membership.kind === "REQUEST" ? UserRoundPlus : Clock3,
                      label:
                        person.membership.kind === "REQUEST"
                          ? t("Membership requested")
                          : t("Invited"),
                      color: "warning" as const,
                    }
                  : isGroupModerator(person.membership)
                    ? { icon: ShieldCheck, label: t("Group moderator"), color: "accent" as const }
                    : undefined;
          return (
            <UserListRow
              name={name(person)}
              avatarUrl={person.avatarUrl}
              titleAccessory={
                person.membership?.status === "ACCEPTED" ? (
                  <GroupMemberAttention
                    groupId={group.id}
                    userId={person.userId}
                    visible={
                      focused &&
                      active &&
                      !managed &&
                      !menu &&
                      !staffMenu &&
                      visibleIds.has(person.userId)
                    }
                  />
                ) : undefined
              }
              secondary={
                person.optimisticInvited
                  ? t("Sending invitation")
                  : person.ban
                    ? person.ban.until
                      ? `${t("Exclusion ends")}: ${new Date(person.ban.until).toLocaleString(i18n.locale)}`
                      : t("Permanent exclusion")
                    : person.username !== name(person)
                      ? person.username
                      : undefined
              }
              badge={badge}
              actions={
                <>
                  {allowed.includes("approve") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={workflow.isBusy(person.userId)}
                      accessibilityLabel={`${t("Respond to membership request")}: ${name(person)}`}
                      onPress={() => workflow.open(person, "approve")}
                    >
                      <ClipboardCheck size={18} color={accent} />
                    </Button>
                  ) : null}
                  <GroupMemberActions
                    group={group}
                    person={person}
                    busy={workflow.isBusy(person.userId)}
                    onOpenChange={(open) => setStaffMenu(open ? person.userId : null)}
                    onAction={(action) => workflow.open(person, action)}
                  />
                  {allowed.includes("revoke") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={workflow.isBusy(person.userId)}
                      accessibilityLabel={`${t("Revoke group exclusion")}: ${name(person)}`}
                      onPress={() => workflow.open(person, "revoke")}
                    >
                      <RotateCcw size={18} color={accent} />
                    </Button>
                  ) : null}
                  {group.canSocialInteract && person.social && person.userId !== options.userId ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={workflow.isBusy(person.userId)}
                      accessibilityLabel={`${t("Actions")}: ${name(person)}`}
                      onPress={() => setMenu(person.userId)}
                    >
                      <EllipsisVertical size={18} color={muted} />
                    </Button>
                  ) : null}
                </>
              }
            />
          );
        }}
      />
      {managed?.action === "ban" ? (
        <GroupBanDialog
          key={managed.person.userId}
          name={name(managed.person)}
          timeZone={group.location?.timeZone}
          busy={busy}
          failure={failure}
          onCancel={workflow.close}
          onConfirm={(until) => void workflow.confirm("ban", until)}
        />
      ) : managed ? (
        <ConfirmDialog
          title={`${roleChange ? roleLabel : managed.action === "approve" ? t("Respond to membership request") : managed.action === "revoke" ? t("Revoke group exclusion") : t("Remove member")}: ${name(managed.person)}`}
          description={
            roleChange
              ? managed.action === "promote"
                ? t(
                    "Grant group and event management permissions? Only the creator can change moderator roles. Moderators cannot delete the group or remove or ban its creator or other moderators.",
                  )
                : t(
                    "Remove moderator permissions? Group membership and event participation remain unchanged.",
                  )
              : managed.action === "revoke"
                ? t(
                    "Revoking an exclusion does not restore membership or registrations. A new invitation or request is required.",
                  )
                : t("This affects group membership only. Historical results remain unchanged.")
          }
          busy={busy}
          onCancel={workflow.close}
          actions={
            managed.action === "approve"
              ? [
                  {
                    label: t("Approve"),
                    variant: "primary",
                    icon: <Check size={18} color={accent} />,
                    onPress: () => void workflow.confirm("approve"),
                  },
                  {
                    label: t("Reject"),
                    variant: "danger",
                    icon: <X size={18} color={dangerForeground} />,
                    onPress: () => void workflow.confirm("reject"),
                  },
                ]
              : [
                  {
                    label: roleChange
                      ? roleLabel
                      : managed.action === "revoke"
                        ? t("Revoke group exclusion")
                        : t("Remove member"),
                    variant:
                      managed.action === "revoke" || managed.action === "promote"
                        ? "primary"
                        : "danger",
                    icon:
                      managed.action === "revoke" ? (
                        <RotateCcw size={18} color={accent} />
                      ) : roleChange ? (
                        <ShieldCheck
                          size={18}
                          color={managed.action === "promote" ? accent : dangerForeground}
                        />
                      ) : (
                        <UserRoundMinus size={18} color={dangerForeground} />
                      ),
                    onPress: () => void workflow.confirm(),
                  },
                ]
          }
        >
          {failure ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {failure}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
      <UserActionsSheet
        visible={Boolean(selected)}
        user={selected ? groupPersonContact(selected) : null}
        busy={Boolean(selected && workflow.isBusy(selected.userId))}
        blockLabel={t("Block user globally")}
        friendRequest={selected?.social?.friendRequest}
        canSendFriendRequest={Boolean(
          selected?.social &&
            !selected.social.isFriend &&
            !selected.social.friendRequest &&
            !selected.social.blockedByMe,
        )}
        onClose={() => setMenu(null)}
        onAction={async (action) => {
          if (selected && action !== "profile") await workflow.runSocial(selected, action);
        }}
      />
    </NotificationAttentionScope>
  );
}
