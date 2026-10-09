import type { OrganizationResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatLocationAddress,
  isDestructiveOrganizationAction,
  type OrganizationAction,
  organizationActionLabel,
  ownOrganizationActions,
  useOrganization,
  useOrganizationActions,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import {
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  LogOut,
  Pencil,
  Plus,
  UserRoundPlus,
} from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { TabBar } from "@/components/common/ui/TabBar";
import { Events } from "@/components/events/Events";
import { OrganizationArtwork } from "@/components/organizations/OrganizationArtwork";
import { OrganizationMembers } from "@/components/organizations/OrganizationMembers";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { OrganizationInvitationResponse } from "./OrganizationInvitationResponse";

function StatusBadge({ organization }: { organization: OrganizationResponse }) {
  const t = useT();
  const rejected = organization.reviewStatus === "REJECTED";
  const pending = organization.reviewStatus === "PENDING";
  const color = useThemeColor(rejected ? "danger" : pending ? "warning" : "success");
  const Icon = rejected ? CircleX : pending ? Clock3 : CircleCheck;
  return (
    <Chip size="sm" color={rejected ? "danger" : pending ? "warning" : "success"} variant="soft">
      <Icon size={14} color={color} />
      <Chip.Label>
        {rejected ? t("Changes rejected") : pending ? t("Awaiting review") : t("Approved")}
      </Chip.Label>
    </Chip>
  );
}
const icons = { request: UserRoundPlus, accept: Check, decline: CircleX, cancel: LogOut };

export function OrganizationDetail({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const t = useT();
  const options = useCommunityApi();
  const accentForeground = useThemeColor("accent-foreground");
  const danger = useThemeColor("danger");
  const detail = useOrganization(options, organizationId);
  const actions = useOrganizationActions(options);
  const organization = communityAccessDenied(detail.error) ? undefined : detail.data;
  const [tab, setTab] = useState("details");
  const [confirm, setConfirm] = useState<OrganizationAction | null>(null);
  const run = (action: OrganizationAction) => {
    if (actions.busy || !organization || !ownOrganizationActions(organization).includes(action))
      return;
    if (action === "request") actions.requestJoin.mutate(organizationId);
    else if (options.userId)
      actions.membership.mutate(
        { id: organizationId, userId: options.userId, action },
        { onSuccess: () => setConfirm(null) },
      );
  };
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: organization?.name ?? t("Organization details") }} />
      {detail.isError ? (
        <View style={{ padding: 20, gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load organization")}
          </Typography>
          <Button variant="outline" onPress={() => void detail.refetch()}>
            {t("Try again")}
          </Button>
        </View>
      ) : null}
      {!organization && detail.isPending ? (
        <Skeleton style={{ width: "100%", height: 192, borderRadius: 12 }} />
      ) : null}
      {organization ? (
        <Tabs value={tab} onValueChange={setTab} style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <TabBar>
              <Tabs.Trigger value="details" testID="organization-tab-details" style={{ flex: 1 }}>
                <Tabs.Label>{t("Details")}</Tabs.Label>
              </Tabs.Trigger>
              <Tabs.Trigger value="members" testID="organization-tab-members" style={{ flex: 1 }}>
                <Tabs.Label>{t("Members")}</Tabs.Label>
              </Tabs.Trigger>
              <Tabs.Trigger value="events" testID="organization-tab-events" style={{ flex: 1 }}>
                <Tabs.Label>{t("Events")}</Tabs.Label>
              </Tabs.Trigger>
            </TabBar>
          </View>
          <Tabs.Content value="details" style={{ flex: 1 }}>
            <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Typography
                  className="font-semibold text-foreground"
                  style={{ flex: 1, fontSize: 20 }}
                >
                  {organization.name}
                </Typography>
                <StatusBadge organization={organization} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
                <OrganizationArtwork organization={organization} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Typography className="font-semibold text-foreground">
                    {organization.location.name}
                  </Typography>
                  <Typography className="text-muted">
                    {formatLocationAddress(organization.location.address)}
                  </Typography>
                  <Typography className="text-muted">
                    {organization.memberCount} {t("members")}
                  </Typography>
                </View>
              </View>
              {organization.rejectionReason ? (
                <Typography className="text-danger">{organization.rejectionReason}</Typography>
              ) : null}
              {organization.approved && organization.reviewStatus ? (
                <Typography className="text-muted">
                  {t("Approved information remains visible while changes are reviewed.")}
                </Typography>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {organization.role === "invited" ? (
                  <OrganizationInvitationResponse busy={actions.busy} onAction={run} />
                ) : (
                  ownOrganizationActions(organization).map((action) => {
                    const Icon = icons[action as keyof typeof icons];
                    const destructive = action === "decline" || action === "cancel";
                    return (
                      <Button
                        key={action}
                        isDisabled={actions.busy}
                        variant={destructive ? "danger-soft" : "primary"}
                        onPress={() =>
                          isDestructiveOrganizationAction(action) ? setConfirm(action) : run(action)
                        }
                      >
                        {Icon ? (
                          <Icon size={16} color={destructive ? danger : accentForeground} />
                        ) : null}
                        <Button.Label>
                          {t(organizationActionLabel(action, organization.role))}
                        </Button.Label>
                      </Button>
                    );
                  })
                )}
              </View>
            </ScreenScrollView>
          </Tabs.Content>
          <Tabs.Content value="members" style={{ flex: 1 }}>
            {organization.role === "admin" || organization.role === "accepted" ? (
              <OrganizationMembers organization={organization} />
            ) : (
              <View style={{ padding: 20, gap: 12, alignItems: "flex-start" }}>
                <Typography className="text-muted">
                  {t("Organization members are visible only to confirmed members.")}
                </Typography>
                {organization.role === "invited" ? (
                  <OrganizationInvitationResponse busy={actions.busy} onAction={run} />
                ) : null}
              </View>
            )}
          </Tabs.Content>
          <Tabs.Content value="events" style={{ flex: 1 }}>
            {organization.approved || organization.role === "admin" ? (
              <Events organizationId={organization.id} />
            ) : (
              <Typography className="text-muted" style={{ padding: 20 }}>
                {t("Organization events are available after approval.")}
              </Typography>
            )}
          </Tabs.Content>
        </Tabs>
      ) : null}
      {organization?.role === "admin" && tab === "details" ? (
        <FloatingActions
          label="Edit organization"
          testID="edit-organization-fab"
          variant="primary"
          onPress={() =>
            router.push({ pathname: "/organization/wizard", params: { organizationId } })
          }
        >
          <Pencil size={26} color={accentForeground} />
        </FloatingActions>
      ) : null}
      {organization?.role === "admin" && tab === "events" ? (
        <FloatingActions
          label="New event"
          testID="new-organization-event-fab"
          variant="primary"
          onPress={() => router.push({ pathname: "/event/wizard", params: { organizationId } })}
        >
          <Plus size={26} color={accentForeground} />
        </FloatingActions>
      ) : null}
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
