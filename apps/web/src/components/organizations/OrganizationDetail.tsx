"use client";
import type { OrganizationResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatLocationAddress,
  isDestructiveOrganizationAction,
  type OrganizationAction,
  type OrganizationMemberMode,
  organizationActionMessage as organizationActionLabel,
  organizationMemberActions,
  ownOrganizationActions,
  useOrganization,
  useOrganizationActions,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  Ban,
  Check,
  CircleX,
  LogOut,
  RotateCcw,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { OrganizationArtwork } from "@/components/organizations/OrganizationArtwork";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

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

function OrganizationPeople({ organization }: { organization: OrganizationResponse }) {
  const { t, i18n } = useLingui();
  const options = useCommunityApi();
  const actions = useOrganizationActions(options);
  const [mode, setMode] = useState<OrganizationMemberMode>("accepted");
  const [confirm, setConfirm] = useState<{ action: OrganizationAction; userId: string } | null>(
    null,
  );
  const list = useOrganizationMembers(options, organization.id, mode);
  const people = communityAccessDenied(list.error) ? [] : list.items;
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    fetchNextPage: list.fetchNextPage,
  });
  function run(action: OrganizationAction, userId: string) {
    if (action === "request") return;
    actions.membership.mutate(
      { id: organization.id, userId, action },
      { onSuccess: () => setConfirm(null) },
    );
  }
  return (
    <section className="space-y-4">
      {organization.role === "admin" ? (
        <Tabs
          selectedKey={mode}
          onSelectionChange={(key) => setMode(String(key) as OrganizationMemberMode)}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label={t`Organization membership`}>
              <Tabs.Tab id="accepted">
                {t`Members`}
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="pending">
                {t`Requests and invitations`}
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="excluded">
                {t`Excluded members`}
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      ) : (
        <h2 className="text-sm font-semibold">{t`Members`}</h2>
      )}
      {list.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      <GroupedList>
        {people.map((person) => (
          <GroupedRow key={person.userId}>
            <Avatar size="md">
              <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />
              <Avatar.Fallback>{person.username?.charAt(0) ?? "?"}</Avatar.Fallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {person.username ?? t`Username unavailable`}
              </span>
              {person.isAdmin ? (
                <span className="block text-xs text-default-500">{t`Organization admin`}</span>
              ) : person.membership?.status === "PENDING" ? (
                <span className="block text-xs text-default-500">
                  {person.membership.kind === "REQUEST" ? t`Membership requested` : t`Invited`}
                </span>
              ) : null}
            </span>
            {organizationMemberActions(organization, person).map((action) => {
              const Icon = icons[action];
              return (
                <Button
                  key={action}
                  isIconOnly
                  variant={action === "approve" || action === "revoke" ? "primary" : "danger-soft"}
                  size="sm"
                  isDisabled={actions.busy}
                  aria-label={`${i18n._(organizationActionLabel(action))}: ${person.username ?? t`Username unavailable`}`}
                  onPress={() =>
                    isDestructiveOrganizationAction(action)
                      ? setConfirm({ action, userId: person.userId })
                      : run(action, person.userId)
                  }
                >
                  <Icon className="size-4" />
                </Button>
              );
            })}
          </GroupedRow>
        ))}
      </GroupedList>
      {!list.isPending && !list.isError && !list.items.length ? (
        <EmptyList icon={<UsersRound className="size-7" />}>{t`No members found`}</EmptyList>
      ) : null}
      {list.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load organization members`}</p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={sentinel} />
      {list.isFetchingNextPage ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : list.hasNextPage ? (
        <Button variant="outline" onPress={() => void list.fetchNextPage()}>
          {list.isFetchNextPageError ? t`Could not load organization members. Retry` : t`Load more`}
        </Button>
      ) : null}
      {confirm ? (
        <ContactConfirmDialog
          title={i18n._(organizationActionLabel(confirm.action))}
          description={t`Before booking deadlines, reservations and demonstrator assignments are cancelled. Frozen participation and results remain. Removed members cannot rejoin until their exclusion is revoked.`}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setConfirm(null);
          }}
          actions={[
            {
              label: i18n._(organizationActionLabel(confirm.action)),
              variant: "danger",
              onPress: () => run(confirm.action, confirm.userId),
            },
          ]}
        />
      ) : null}
    </section>
  );
}
export function OrganizationDetail({ organizationId }: { organizationId: string }) {
  const { t, i18n } = useLingui();
  const router = useRouter();
  const options = useCommunityApi();
  const detail = useOrganization(options, organizationId);
  const actions = useOrganizationActions(options);
  const [confirm, setConfirm] = useState<OrganizationAction | null>(null);
  const organization = communityAccessDenied(detail.error) ? undefined : detail.data;
  const run = (action: OrganizationAction) => {
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
        <h1 className="text-lg font-semibold">{organization?.name ?? t`Organization details`}</h1>
      </div>
      {organization ? (
        <div className="flex flex-wrap gap-3">
          {organization.role === "admin" ? (
            <>
              <Link href={`/organizations/${organization.id}/edit`}>{t`Edit organization`}</Link>
              <Link href={`/organizations/${organization.id}/invite`}>{t`Invite friends`}</Link>
              <Link href={`/events/new?organizationId=${organization.id}`}>{t`New event`}</Link>
            </>
          ) : null}
          {organization.approved || organization.role === "admin" ? (
            <Link href={`/organizations/${organization.id}/events`}>{t`Organization events`}</Link>
          ) : null}
        </div>
      ) : null}
      {!organization && detail.isPending ? <Skeleton className="h-48 w-full rounded-xl" /> : null}
      {detail.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load organization`}</p>
          <Button variant="outline" onPress={() => void detail.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {organization ? (
        <>
          <div className="flex items-start gap-4">
            <OrganizationArtwork organization={organization} />
            <div className="space-y-1">
              <p className="font-medium">{organization.location.name}</p>
              <p className="text-sm text-default-500">
                {formatLocationAddress(organization.location.address)}
              </p>
              <p className="text-sm text-default-500">
                {organization.memberCount} {t`members`}
              </p>
            </div>
          </div>
          {organization.reviewStatus ? (
            <div role="status" className="rounded-xl border border-separator p-3">
              <p className="font-medium">
                {organization.reviewStatus === "REJECTED"
                  ? t`Changes rejected`
                  : t`Awaiting review`}
              </p>
              {organization.rejectionReason ? (
                <p className="text-sm text-danger">{organization.rejectionReason}</p>
              ) : null}
              {organization.approved ? (
                <p className="text-sm text-default-500">{t`Approved information remains visible while changes are reviewed.`}</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
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
                  <Icon className="size-4" />
                  {i18n._(organizationActionLabel(action, organization.role))}
                </Button>
              );
            })}
          </div>
          {organization.role === "admin" || organization.role === "accepted" ? (
            <OrganizationPeople organization={organization} />
          ) : (
            <p className="text-sm text-default-500">{t`Organization members are visible only to confirmed members.`}</p>
          )}
          {confirm ? (
            <ContactConfirmDialog
              title={i18n._(organizationActionLabel(confirm, organization.role))}
              description={t`Before booking deadlines, reservations and demonstrator assignments are cancelled. Frozen participation and results remain.`}
              busy={actions.busy}
              onCancel={() => {
                if (!actions.busy) setConfirm(null);
              }}
              actions={[
                {
                  label: i18n._(organizationActionLabel(confirm, organization.role)),
                  variant: "danger",
                  onPress: () => run(confirm),
                },
              ]}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}
