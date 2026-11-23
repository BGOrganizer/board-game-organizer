import { Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Dices,
  ShoppingBasket,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { record } from "./protocol";

export function OperationResult({ operation, data }: { operation: string; data: unknown }) {
  const { t, i18n } = useLingui();
  const object = record(data);
  const collections = [
    data,
    object?.items,
    object?.rows,
    object?.entries,
    object?.participants,
    object?.members,
    object?.votes,
    object?.players,
    object?.games,
    object?.notifications,
    object?.results,
    object?.points,
  ].filter(Array.isArray);
  const items = collections.find((collection) => collection.length > 0) ?? collections[0] ?? [data];
  const headings = [
    ["ranking", t`Rankings`, Trophy],
    ["rating", t`Rankings`, Trophy],
    ["notification", t`Notifications`, Bell],
    ["market", t`Marketplace`, ShoppingBasket],
    ["contact", t`Contacts`, UsersRound],
    ["friend", t`Contacts`, UsersRound],
    ["collection", t`Collection`, Dices],
    ["profile", t`Profile`, UserRound],
    ["activity", t`Activities`, CalendarDays],
    ["group", t`Groups`, UsersRound],
    ["table", t`Tables`, Dices],
    ["event", t`Events`, CalendarDays],
    ["game", t`Games`, Dices],
  ] as const;
  const [, heading, Icon] = headings.find(([match]) => operation.includes(match)) ?? [
    "",
    t`Results`,
    ClipboardList,
  ];
  const labels = {
    username: t`Username`,
    status: t`Status`,
    eventName: t`Event`,
    groupName: t`Group`,
    gameName: t`Board game`,
    description: t`Description`,
    context: t`Details`,
    memberCount: t`Members`,
    tableCount: t`Tables`,
    seatedCount: t`Participants`,
    gamesPlayed: t`Games played`,
    gamesWon: t`Games won`,
    nd: t`ND`,
    score: t`Score`,
    rating: t`Game rating`,
    count: t`Total`,
  };
  const statuses = {
    PLANNING: t`Planning`,
    CONFIRMED: t`Confirmed`,
    TERMINATED: t`Finished`,
    PENDING: t`Pending`,
  };

  return (
    <section className="space-y-3" aria-labelledby="results-heading">
      <h1 id="results-heading" className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-accent" aria-hidden />
        {heading}
      </h1>
      {!items.length ? (
        <EmptyList icon={<Icon className="size-8" />}>{t`No results found`}</EmptyList>
      ) : null}
      {items.map((item, index) => {
        const entry = record(item);
        const child = record(entry?.group ?? entry?.event ?? entry?.table ?? entry?.game);
        const actor = record(entry?.author ?? entry?.user);
        const stats = record(entry?.stats ?? entry?.player);
        const fields = { ...actor, ...child, ...stats, ...entry };
        const title = [fields.name, fields.title].find(
          (field): field is string => typeof field === "string" && field.length > 0,
        );
        const values = Object.entries(labels).flatMap(([field, label]) => {
          const value = fields[field];
          if (typeof value === "string" && value.length) {
            if (field === "username") return [[label, value.startsWith("@") ? value : `@${value}`]];
            if (field === "status")
              return Object.hasOwn(statuses, value)
                ? [[label, statuses[value as keyof typeof statuses]]]
                : [];
            return [[label, value]];
          }
          return typeof value === "number" ? [[label, i18n.number(value)]] : [];
        });

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: A tool response is an immutable snapshot, including rows without IDs.
          <ListCard key={index}>
            <Card.Content className="space-y-2 p-4">
              {title ? <ListCardBody title={title} /> : null}
              {values.length ? (
                <dl className="space-y-1 text-sm">
                  {values.map(([label, value]) => (
                    <div key={label} className="flex flex-wrap items-start gap-x-2 break-words">
                      <dt className="font-medium">{label}</dt>
                      <dd className="min-w-0 text-muted">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {!title && !values.length ? (
                <p className="text-sm text-muted">
                  {typeof item === "string" ? item : t`Operation completed`}
                </p>
              ) : null}
            </Card.Content>
          </ListCard>
        );
      })}
    </section>
  );
}
