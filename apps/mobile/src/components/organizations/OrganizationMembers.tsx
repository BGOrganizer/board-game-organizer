import type {
  OrganizationMemberResponse,
  OrganizationResponse,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  organizationMemberActions,
  organizationMemberContact,
  useOrganizationActions,
  useOrganizationPeople,
  useOrganizationSocialActions,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import {
  Ban,
  Check,
  CircleX,
  ClipboardCheck,
  Clock3,
  Crown,
  EllipsisVertical,
  RotateCcw,
  UserRoundMinus,
  UsersRound,
  X,
} from "lucide-react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import {
  type UserActionConfirmation,
  UserActionsSheet,
} from "@/components/common/ui/UserActionsSheet";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
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
  const actions = useOrganizationActions(options);
  const social = useOrganizationSocialActions(options);
  const busy = actions.busy || social.busy;
  const list = useOrganizationPeople(options, organization);
  const [managing, setManaging] = useState<{ userId: string; status: string; kind: string } | null>(
    null,
  );
  const [menu, setMenu] = useState<{ userId: string; confirm?: UserActionConfirmation } | null>(
    null,
  );
  const canViewPeople = !communityAccessDenied(list.error);
  const selected = canViewPeople
    ? list.items.find((person) => person.userId === menu?.userId)
    : undefined;
  const openManagement = (person: OrganizationMemberResponse) => {
    if (person.membership)
      setManaging({
        userId: person.userId,
        status: person.membership.status,
        kind: person.membership.kind,
      });
  };
  const managed = canViewPeople
    ? list.items.find(
        (person) =>
          managing &&
          person.userId === managing.userId &&
          person.membership?.status === managing.status &&
          person.membership.kind === managing.kind,
      )
    : undefined;
  const managedActions = managed ? organizationMemberActions(organization, managed) : [];
  const request =
    managed?.membership?.status === "PENDING" && managed.membership.kind === "REQUEST";
  const invitation =
    managed?.membership?.status === "PENDING" && managed.membership.kind === "INVITATION";
  const managementTitle = request
    ? t("Respond to membership request")
    : invitation
      ? t("Cancel organization invitation")
      : t("Remove member");
  const run = (
    person: OrganizationMemberResponse,
    action: "remove" | "ban" | "revoke" | "approve" | "reject",
  ) => {
    if (busy || !canViewPeople || !organizationMemberActions(organization, person).includes(action))
      return;
    actions.membership.mutate(
      { id: organization.id, userId: person.userId, action },
      { onSuccess: () => setManaging(null) },
    );
  };
  return (
    <>
      <UserList
        testID="organization-members-scroll"
        data={canViewPeople ? list.items : []}
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
        error={t("Could not load organization members")}
        skeleton={<Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />}
        header={
          organization.role === "admin" ? (
            <AddUserRow
              label={t("Invite friends")}
              description={
                !organization.approved
                  ? t("Invitations require an approved organization.")
                  : undefined
              }
              isDisabled={!organization.approved || busy || !canViewPeople}
              onPress={() =>
                router.push({
                  pathname: "/organization/invite",
                  params: { organizationId: organization.id },
                })
              }
            />
          ) : null
        }
        renderRow={(person) => {
          const name = person.name ?? person.username ?? t("Username unavailable");
          const disabled = busy || !person.social;
          const memberActions = organizationMemberActions(organization, person);
          const badge = person.isAdmin
            ? { icon: Crown, label: t("Organization admin"), color: "warning" as const }
            : person.membership?.status === "PENDING"
              ? {
                  icon: Clock3,
                  label:
                    person.membership.kind === "REQUEST" ? t("Membership requested") : t("Invited"),
                  color: "warning" as const,
                }
              : person.membership?.status === "EXCLUDED"
                ? { icon: Ban, label: t("Excluded member"), color: "danger" as const }
                : undefined;
          return (
            <UserListRow
              name={name}
              avatarUrl={person.avatarUrl}
              secondary={person.username !== name ? person.username : undefined}
              badge={badge}
              actions={
                <>
                  {memberActions.includes("approve") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={busy}
                      accessibilityLabel={`${t("Respond to membership request")}: ${name}`}
                      onPress={() => openManagement(person)}
                    >
                      <ClipboardCheck size={18} color={accentForeground} />
                    </Button>
                  ) : null}
                  {memberActions.includes("remove") ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={busy}
                      accessibilityLabel={`${person.membership?.status === "PENDING" ? t("Cancel organization invitation") : t("Remove member")}: ${name}`}
                      onPress={() => openManagement(person)}
                    >
                      {person.membership?.status === "PENDING" ? (
                        <CircleX size={18} color={danger} />
                      ) : (
                        <UserRoundMinus size={18} color={danger} />
                      )}
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
                        variant="ghost"
                        style={{ minWidth: 44, minHeight: 44 }}
                        isDisabled={disabled}
                        accessibilityLabel={`${t("Actions")}: ${name}`}
                        onPress={() => setMenu({ userId: person.userId })}
                      >
                        <EllipsisVertical size={18} color={muted} />
                      </Button>
                    </>
                  ) : null}
                </>
              }
            />
          );
        }}
      />
      {managed && managedActions.length > 0 ? (
        <CommunityConfirm
          title={managementTitle}
          cancelLast={request}
          cancelIcon={request ? <X size={18} color={foreground} /> : undefined}
          description={
            request
              ? t(
                  "Accept or reject this membership request. Banning prevents rejoining this organization until revoked; global social blocking is separate.",
                )
              : invitation
                ? t(
                    "The organization invitation will be cancelled. You can invite this user again.",
                  )
                : t(
                    "Before booking deadlines, reservations and demonstrator assignments are cancelled. Frozen participation and results remain. Remove allows new requests and invitations; Remove and exclude blocks rejoining this organization until revoked. Global social blocking is separate.",
                  )
          }
          busy={busy}
          onCancel={() => {
            if (!busy) setManaging(null);
          }}
          actions={
            request
              ? [
                  {
                    label: t("Accept"),
                    variant: "primary",
                    icon: <Check size={18} color={accentForeground} />,
                    onPress: () => run(managed, "approve"),
                  },
                  {
                    label: t("Reject"),
                    variant: "danger",
                    icon: <X size={18} color={accentForeground} />,
                    onPress: () => run(managed, "reject"),
                  },
                  {
                    label: t("Ban from organization"),
                    variant: "danger",
                    icon: <Ban size={18} color={accentForeground} />,
                    onPress: () => run(managed, "ban"),
                  },
                ]
              : invitation
                ? [
                    {
                      label: t("Cancel organization invitation"),
                      variant: "danger",
                      onPress: () => run(managed, "remove"),
                    },
                  ]
                : [
                    {
                      label: t("Remove from organization"),
                      variant: "danger",
                      onPress: () => run(managed, "remove"),
                    },
                    {
                      label: t("Remove and exclude"),
                      variant: "danger",
                      onPress: () => run(managed, "ban"),
                    },
                  ]
          }
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
