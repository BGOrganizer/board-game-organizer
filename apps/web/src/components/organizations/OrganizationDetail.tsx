"use client";
import {
  communityAccessDenied,
  isDestructiveOrganizationAction,
  type OrganizationAction,
  organizationActionMessage,
  ownOrganizationActions,
  useOrganization,
  useOrganizationActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, LogOut, Pencil, Plus, UserRoundPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { Events } from "@/components/events/Events";
import { OrganizationMembers } from "@/components/organizations/OrganizationMembers";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { OrganizationDetailsCard } from "./OrganizationDetailsCard";
import { OrganizationInvitationResponse } from "./OrganizationInvitationResponse";

const icons = { request: UserRoundPlus, cancel: X };
export function OrganizationDetail({
  organizationId,
  initialTab = "details",
}: {
  organizationId: string;
  initialTab?: string;
}) {
  const { t, i18n } = useLingui();
  const router = useRouter();
  const options = useCommunityApi();
  const detail = useOrganization(options, organizationId);
  const actions = useOrganizationActions(options);
  const [tab, setTab] = useState(
    ["details", "members", "events"].includes(initialTab) ? initialTab : "details",
  );
  const [confirm, setConfirm] = useState<OrganizationAction | null>(null);
  const organization = communityAccessDenied(detail.error) ? undefined : detail.data;
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
    <main className="mx-auto w-full max-w-3xl space-y-5 pb-28">
      <div className="flex items-center gap-2">
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t`Back`}
          onPress={() => router.push("/groups/organizations")}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="flex-1 text-lg font-semibold">{t`Organization details`}</h1>
        {organization?.role === "accepted" ? (
          <Button
            isIconOnly
            variant="danger-soft"
            aria-label={t`Leave organization`}
            isDisabled={actions.busy}
            onPress={() => setConfirm("cancel")}
          >
            <LogOut className="size-5" aria-hidden />
          </Button>
        ) : null}
      </div>
      {!organization && detail.isPending ? <Skeleton className="h-48 w-full rounded-xl" /> : null}
      {detail.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load organization`}</p>
          <Button variant="outline" onPress={() => void detail.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {organization ? (
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => {
            setTab(String(key));
            router.replace(`/organizations/${organizationId}?tab=${key}`);
          }}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label={t`Organization sections`}>
              <Tabs.Tab id="details">
                {t`Details`}
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="members">
                {t`Members`}
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="events">
                {t`Events`}
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="details" className="space-y-4 pt-4">
            <OrganizationDetailsCard organization={organization}>
              {organization.role !== "accepted" &&
              ownOrganizationActions(organization).length > 0 ? (
                organization.role === "invited" ? (
                  <OrganizationInvitationResponse
                    presentation="choices"
                    busy={actions.busy}
                    onAction={run}
                  />
                ) : (
                  ownOrganizationActions(organization).map((action) => {
                    const Icon = icons[action as keyof typeof icons];
                    const label = i18n._(organizationActionMessage(action, organization.role));
                    return (
                      <Button
                        key={action}
                        isIconOnly={action === "cancel"}
                        aria-label={label}
                        isDisabled={actions.busy}
                        variant={action === "cancel" ? "danger-soft" : "primary"}
                        onPress={() =>
                          isDestructiveOrganizationAction(action) ? setConfirm(action) : run(action)
                        }
                      >
                        {Icon ? <Icon className="size-4" aria-hidden /> : null}
                        {action !== "cancel" ? label : null}
                      </Button>
                    );
                  })
                )
              ) : null}
            </OrganizationDetailsCard>
            {organization.role === "admin" ? (
              <Link
                href={`/organizations/${organization.id}/edit`}
                className="button button--primary button--icon-only fixed right-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg sm:right-6"
                aria-label={t`Edit organization`}
              >
                <Pencil className="size-6" />
              </Link>
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel id="members" className="pt-4">
            {organization.role === "admin" || organization.role === "accepted" ? (
              <OrganizationMembers organization={organization} />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-default-500">{t`Organization members are visible only to confirmed members.`}</p>
                {organization.role === "invited" ? (
                  <OrganizationInvitationResponse busy={actions.busy} onAction={run} />
                ) : null}
              </div>
            )}
          </Tabs.Panel>
          <Tabs.Panel id="events" className="pt-4">
            {organization.approved || organization.role === "admin" ? (
              <Events organizationId={organization.id} />
            ) : (
              <p className="text-sm text-default-500">{t`Organization events are available after approval.`}</p>
            )}
            {organization.role === "admin" ? (
              <Link
                href={`/events/new?organizationId=${organization.id}`}
                className="button button--primary button--icon-only fixed right-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg sm:right-6"
                aria-label={t`New event`}
              >
                <Plus className="size-6" />
              </Link>
            ) : null}
          </Tabs.Panel>
        </Tabs>
      ) : null}
      {confirm ? (
        <ContactConfirmDialog
          title={i18n._(organizationActionMessage(confirm, organization?.role))}
          description={t`Before booking deadlines, reservations and demonstrator assignments are cancelled. Frozen participation and results remain.`}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setConfirm(null);
          }}
          actions={[
            {
              label: i18n._(organizationActionMessage(confirm, organization?.role)),
              variant: "danger",
              onPress: () => run(confirm),
            },
          ]}
        />
      ) : null}
    </main>
  );
}
