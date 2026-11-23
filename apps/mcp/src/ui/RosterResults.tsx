import { groupMembershipSchema } from "@board-game-organizer/schemas";
import {
  eventUserRoles,
  formatUsername,
  groupUserRoles,
  tableUserRoles,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { UsersRound } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { EventGuestBadge } from "@/components/events/EventGuestBadge";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { PeopleMoreButton } from "./PeopleMoreButton";
import { type PeopleResultProps, usePeoplePages } from "./usePeoplePages";
import { useWidgetNavigation } from "./WidgetNavigation";

const rosterPage = z.object({
  items: z
    .array(
      z
        .object({
          id: z.string().optional(),
          userId: z.string().optional(),
          name: z.string().nullable(),
          username: z.string().nullish(),
          avatarUrl: z.string().nullish(),
          guestName: z.string().optional(),
          position: z.enum(["SEATED", "WAITING", "FROZEN"]).nullish(),
          kind: z.string().optional(),
          status: z.string().optional(),
          isAdmin: z.boolean().optional(),
          membership: groupMembershipSchema.nullish(),
          accepted: z.boolean().optional(),
          pendingInvitation: z.boolean().optional(),
          demonstrator: z.boolean().optional(),
          waiting: z.boolean().optional(),
          managementRole: z.enum(["admin", "moderator"]).nullish(),
        })
        .refine((item) => Boolean(item.id || item.userId)),
    )
    .max(50),
  nextCursor: z.string().nullable(),
});

export function RosterResults(props: PeopleResultProps & { embedded?: boolean }) {
  const { t, i18n } = useLingui();
  const { canOpenPath, openPath } = useWidgetNavigation(props.app);
  const [openError, setOpenError] = useState(false);
  const { pages, invalid } = usePeoplePages(props, rosterPage);
  const rows = new Map(
    pages.data?.pages.flatMap((page) =>
      page.items.map((item) => [item.id ?? item.userId, item] as const),
    ),
  );
  return (
    <section className="space-y-3">
      {props.embedded ? null : (
        <SectionHeaderCard
          title={props.operation === "list_group_members" ? t`Members` : t`Participants`}
          leading={<UsersRound className="size-5 text-accent" aria-hidden />}
        />
      )}
      {invalid || pages.isError ? (
        <p role="alert" className="text-danger">{t`Could not load participants`}</p>
      ) : null}
      {openError ? <p role="alert" className="text-danger">{t`Could not load profile`}</p> : null}
      {!invalid && !pages.isError && !rows.size ? (
        <EmptyList icon={<UsersRound className="size-7" />}>{t`No participants yet`}</EmptyList>
      ) : null}
      <GroupedList>
        {Array.from(rows, ([key, item]) => {
          const guest = item.kind === "GUEST";
          const userId = item.userId ?? item.id;
          const roles =
            props.operation === "list_group_members"
              ? groupUserRoles({ isAdmin: Boolean(item.isAdmin), membership: item.membership })
              : props.operation === "list_event_participants"
                ? eventUserRoles({ ...item, position: item.position ?? null })
                : tableUserRoles(item);
          const primary = roles[0];
          const name = guest
            ? item.guestName || item.name || t`Guest`
            : item.name || t`Username unavailable`;
          return (
            <UserListRow
              key={key}
              name={formatUsername(guest ? item.guestName : item.username, name)}
              avatarUrl={guest ? null : item.avatarUrl}
              avatarContent={guest ? <GuestAvatar name={name} /> : undefined}
              onPress={
                !guest && userId && userId !== props.viewerUserId
                  ? () => {
                      setOpenError(false);
                      const path = `/profiles/${encodeURIComponent(userId)}`;
                      void openPath(path).then(
                        (opened) => setOpenError(!opened && !canOpenPath(path)),
                        () => setOpenError(true),
                      );
                    }
                  : undefined
              }
              secondary={
                guest ? t`Guest` : primary ? i18n._(recordUserRoleMessages[primary]) : undefined
              }
              badge={guest ? <EventGuestBadge /> : <UserRoleBadge roles={roles} />}
            />
          );
        })}
      </GroupedList>
      <PeopleMoreButton pages={pages} />
    </section>
  );
}
