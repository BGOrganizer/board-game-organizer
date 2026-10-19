import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  groupPersonActions,
  groupPersonContact,
  useGroupMemberManagement,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Ban,
  ClipboardCheck,
  Clock3,
  Crown,
  EllipsisVertical,
  RotateCcw,
  UserRoundMinus,
  UsersRound,
} from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { UserActionsSheet } from "@/components/common/ui/UserActionsSheet";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupBanDialog } from "./GroupBanDialog";
export function GroupMembers({ group }: { group: GroupRecordResponse }) {
  const t = useT(),
    options = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    { i18n } = useLingui();
  const [foreground, muted, danger, accent] = useThemeColor([
    "foreground",
    "muted",
    "danger",
    "accent-foreground",
  ]);
  const workflow = useGroupMemberManagement(options, group),
    { list, busy } = workflow;
  const [menu, setMenu] = useState<string | null>(null);
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
  return (
    <>
      <UserList
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
          group.role === "admin" ? (
            <View style={{ gap: 12 }}>
              <AddUserRow
                label={t("Invite friends")}
                isDisabled={!group.canInvite || busy || denied}
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
              <Button
                variant="outline"
                isDisabled={busy || denied}
                onPress={() =>
                  router.push({ pathname: "/group/ban", params: { groupId: group.id } })
                }
              >
                <Ban size={18} color={danger} />
                <Button.Label>{t("Exclude a user")}</Button.Label>
              </Button>
            </View>
          ) : undefined
        }
        renderRow={(person) => {
          const allowed = groupPersonActions(group, person);
          const badge = person.isAdmin
            ? { icon: Crown, label: t("Group admin"), color: "warning" as const }
            : person.ban
              ? { icon: Ban, label: t("Excluded from group"), color: "danger" as const }
              : person.membership?.status === "PENDING"
                ? {
                    icon: Clock3,
                    label:
                      person.membership.kind === "REQUEST"
                        ? t("Membership requested")
                        : t("Invited"),
                    color: "warning" as const,
                  }
                : undefined;
          return (
            <UserListRow
              name={name(person)}
              avatarUrl={person.avatarUrl}
              secondary={
                person.ban
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
                      isDisabled={busy}
                      accessibilityLabel={`${t("Respond to membership request")}: ${name(person)}`}
                      onPress={() => workflow.open(person, "approve")}
                    >
                      <ClipboardCheck size={18} color={accent} />
                    </Button>
                  ) : null}
                  {allowed.includes("remove") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={busy}
                      accessibilityLabel={`${t("Remove member")}: ${name(person)}`}
                      onPress={() => workflow.open(person, "remove")}
                    >
                      <UserRoundMinus size={18} color={danger} />
                    </Button>
                  ) : null}
                  {allowed.includes("ban") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={busy}
                      accessibilityLabel={`${t("Exclude from group")}: ${name(person)}`}
                      onPress={() => workflow.open(person, "ban")}
                    >
                      <Ban size={18} color={danger} />
                    </Button>
                  ) : null}
                  {allowed.includes("revoke") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={busy}
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
                      isDisabled={busy}
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
          busy={busy}
          failure={failure}
          onCancel={workflow.close}
          onConfirm={(until) => void workflow.confirm("ban", until)}
        />
      ) : managed ? (
        <ConfirmDialog
          title={`${managed.action === "approve" ? t("Respond to membership request") : managed.action === "revoke" ? t("Revoke group exclusion") : t("Remove member")}: ${name(managed.person)}`}
          description={
            managed.action === "revoke"
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
                    onPress: () => void workflow.confirm("approve"),
                  },
                  {
                    label: t("Reject"),
                    variant: "danger",
                    onPress: () => void workflow.confirm("reject"),
                  },
                ]
              : [
                  {
                    label:
                      managed.action === "revoke"
                        ? t("Revoke group exclusion")
                        : t("Remove member"),
                    variant: managed.action === "revoke" ? "primary" : "danger",
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
        busy={busy}
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
    </>
  );
}
