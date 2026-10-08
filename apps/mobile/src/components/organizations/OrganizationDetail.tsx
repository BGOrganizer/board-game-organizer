import type { OrganizationResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatLocationAddress,
  isDestructiveOrganizationAction,
  type OrganizationAction,
  type OrganizationMemberMode,
  organizationActionLabel,
  organizationMemberActions,
  ownOrganizationActions,
  useOrganization,
  useOrganizationActions,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import {
  Ban,
  Check,
  CircleX,
  LogOut,
  RotateCcw,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { FlatList, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { OrganizationArtwork } from "@/components/organizations/OrganizationArtwork";
import { floatingActionLayout } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

const icons = {
  request: UserRoundPlus,
  accept: Check,
  decline: CircleX,
  approve: Check,
  reject: CircleX,
  cancel: LogOut,
  remove: UserRoundMinus,
  ban: Ban,
  revoke: RotateCcw,
};
function OrganizationPeople({
  organization,
  header,
}: {
  organization: OrganizationResponse;
  header: ReactNode;
}) {
  const t = useT();
  const options = useCommunityApi();
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");
  const insets = useSafeAreaInsets();
  const actions = useOrganizationActions(options);
  const [mode, setMode] = useState<OrganizationMemberMode>("accepted");
  const [confirm, setConfirm] = useState<{ action: OrganizationAction; userId: string } | null>(
    null,
  );
  const list = useOrganizationMembers(options, organization.id, mode);
  const run = (action: OrganizationAction, userId: string) => {
    if (action !== "request")
      actions.membership.mutate(
        { id: organization.id, userId, action },
        { onSuccess: () => setConfirm(null) },
      );
  };
  return (
    <>
      <FlatList
        testID="organization-members-scroll"
        style={{ flex: 1 }}
        data={communityAccessDenied(list.error) ? [] : list.items}
        keyExtractor={(person) => person.userId}
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          flexGrow: 1,
          paddingBottom: floatingActionLayout(insets.bottom, 100).paddingBottom,
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
            void list.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 12 }}>
            {header}
            {organization.role === "admin" ? (
              <Tabs
                value={mode}
                onValueChange={(value) => setMode(value as OrganizationMemberMode)}
              >
                <Tabs.List>
                  <Tabs.Indicator />
                  <Tabs.Trigger value="accepted">
                    <Tabs.Label>{t("Members")}</Tabs.Label>
                  </Tabs.Trigger>
                  <Tabs.Trigger value="pending">
                    <Tabs.Label>{t("Requests and invitations")}</Tabs.Label>
                  </Tabs.Trigger>
                  <Tabs.Trigger value="excluded">
                    <Tabs.Label>{t("Excluded members")}</Tabs.Label>
                  </Tabs.Trigger>
                </Tabs.List>
              </Tabs>
            ) : (
              <Typography className="font-semibold">{t("Members")}</Typography>
            )}
          </View>
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
        renderItem={({ item: person }) => (
          <GroupedRow>
            <Avatar size="md" alt={person.username ?? t("Username unavailable")}>
              <Avatar.Image source={{ uri: person.avatarUrl ?? undefined }} />
              <Avatar.Fallback>{person.username?.charAt(0) ?? "?"}</Avatar.Fallback>
            </Avatar>
            <View style={{ flex: 1, gap: 4 }}>
              <Typography numberOfLines={1} className="font-semibold">
                {person.username ?? t("Username unavailable")}
              </Typography>
              {person.isAdmin ? (
                <Typography className="text-muted" style={{ fontSize: 12 }}>
                  {t("Organization admin")}
                </Typography>
              ) : person.membership?.status === "PENDING" ? (
                <Typography className="text-muted" style={{ fontSize: 12 }}>
                  {person.membership.kind === "REQUEST" ? t("Membership requested") : t("Invited")}
                </Typography>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, maxWidth: 100 }}>
              {organizationMemberActions(organization, person).map((action) => {
                const Icon = icons[action];
                const primary = action === "approve" || action === "revoke";
                return (
                  <Button
                    key={action}
                    isIconOnly
                    size="sm"
                    variant={primary ? "primary" : "danger-soft"}
                    style={{ minWidth: 44, minHeight: 44 }}
                    isDisabled={actions.busy}
                    accessibilityLabel={`${t(organizationActionLabel(action))}: ${person.username ?? t("Username unavailable")}`}
                    onPress={() =>
                      isDestructiveOrganizationAction(action)
                        ? setConfirm({ action, userId: person.userId })
                        : run(action, person.userId)
                    }
                  >
                    <Icon size={16} color={primary ? foreground : danger} />
                  </Button>
                );
              })}
            </View>
          </GroupedRow>
        )}
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {list.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load organization members")}
                </Typography>
                <Button variant="outline" onPress={() => void list.refetch()}>
                  {t("Try again")}
                </Button>
              </>
            ) : null}
            {list.isFetchingNextPage ? (
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
      {confirm ? (
        <CommunityConfirm
          title={t(organizationActionLabel(confirm.action))}
          description={t(
            "Before booking deadlines, reservations and demonstrator assignments are cancelled. Frozen participation and results remain. Removed members cannot rejoin until their exclusion is revoked.",
          )}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setConfirm(null);
          }}
          onConfirm={() => run(confirm.action, confirm.userId)}
        />
      ) : null}
    </>
  );
}
export function OrganizationDetail({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const t = useT();
  const options = useCommunityApi();
  const foreground = useThemeColor("foreground");
  const insets = useSafeAreaInsets();
  const detail = useOrganization(options, organizationId);
  const actions = useOrganizationActions(options);
  const organization = communityAccessDenied(detail.error) ? undefined : detail.data;
  const [confirm, setConfirm] = useState<OrganizationAction | null>(null);
  const run = (action: OrganizationAction) => {
    if (action === "request") actions.requestJoin.mutate(organizationId);
    else if (options.userId)
      actions.membership.mutate(
        { id: organizationId, userId: options.userId, action },
        { onSuccess: () => setConfirm(null) },
      );
  };
  const header = (
    <View style={{ gap: 16 }}>
      {detail.isError ? (
        <>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load organization")}
          </Typography>
          <Button variant="outline" onPress={() => void detail.refetch()}>
            {t("Try again")}
          </Button>
        </>
      ) : null}
      {organization ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
            <OrganizationArtwork organization={organization} />
            <View style={{ flex: 1, gap: 4 }}>
              <Typography className="font-semibold">{organization.location.name}</Typography>
              <Typography className="text-muted">
                {formatLocationAddress(organization.location.address)}
              </Typography>
              <Typography className="text-muted">
                {organization.memberCount} {t("members")}
              </Typography>
            </View>
          </View>
          {organization.reviewStatus ? (
            <View className="bg-surface" style={{ padding: 12, borderRadius: 12, gap: 8 }}>
              <Typography className="font-semibold">
                {organization.reviewStatus === "REJECTED"
                  ? t("Changes rejected")
                  : t("Awaiting review")}
              </Typography>
              {organization.rejectionReason ? (
                <Typography className="text-danger">{organization.rejectionReason}</Typography>
              ) : null}
              {organization.approved ? (
                <Typography className="text-muted">
                  {t("Approved information remains visible while changes are reviewed.")}
                </Typography>
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ownOrganizationActions(organization).map((action) => {
              const Icon = icons[action];
              return (
                <Button
                  key={action}
                  isDisabled={actions.busy}
                  variant={action === "decline" || action === "cancel" ? "danger-soft" : "primary"}
                  onPress={() =>
                    isDestructiveOrganizationAction(action) ? setConfirm(action) : run(action)
                  }
                >
                  <Icon size={16} color={foreground} />
                  {t(organizationActionLabel(action, organization.role))}
                </Button>
              );
            })}
          </View>
        </>
      ) : detail.isPending ? (
        <Skeleton style={{ width: "100%", height: 192, borderRadius: 12 }} />
      ) : null}
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: organization?.name ?? t("Organization details") }} />
      {organization ? (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", padding: 12 }}>
          {organization.role === "admin" ? (
            <>
              <Button
                size="sm"
                onPress={() =>
                  router.push({ pathname: "/organization/wizard", params: { organizationId } })
                }
              >
                {t("Edit organization")}
              </Button>
              <Button
                size="sm"
                onPress={() =>
                  router.push({ pathname: "/organization/invite", params: { organizationId } })
                }
              >
                {t("Invite friends")}
              </Button>
              <Button
                size="sm"
                onPress={() =>
                  router.push({ pathname: "/event/wizard", params: { organizationId } })
                }
              >
                {t("New event")}
              </Button>
            </>
          ) : null}
          {organization.approved || organization.role === "admin" ? (
            <Button
              size="sm"
              variant="secondary"
              onPress={() => router.push({ pathname: "/events", params: { organizationId } })}
            >
              {t("Organization events")}
            </Button>
          ) : null}
        </View>
      ) : null}
      {organization && (organization.role === "admin" || organization.role === "accepted") ? (
        <OrganizationPeople organization={organization} header={header} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 20,
            gap: 16,
            paddingBottom: floatingActionLayout(insets.bottom, 100).paddingBottom,
          }}
        >
          {header}
          {organization ? (
            <Typography className="text-muted">
              {t("Organization members are visible only to confirmed members.")}
            </Typography>
          ) : null}
        </ScrollView>
      )}
      {confirm ? (
        <CommunityConfirm
          title={t(organizationActionLabel(confirm, organization?.role))}
          description={t(
            "Before booking deadlines, reservations and demonstrator assignments are cancelled. Frozen participation and results remain.",
          )}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setConfirm(null);
          }}
          onConfirm={() => run(confirm)}
        />
      ) : null}
    </View>
  );
}
