import { Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { UsersRound } from "lucide-react";
import { z } from "zod";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { WidgetLink } from "./WidgetLink";

export const groupResult = z.object({
  id: z.uuid(),
  name: z.string(),
  reviewStatus: z.literal("PENDING").optional(),
});

export function GroupCreated({ app, group }: { app: App; group: z.infer<typeof groupResult> }) {
  const { t } = useLingui();
  return (
    <ListCard>
      <Card.Content className="space-y-3 p-4">
        <p role="status" className="text-sm text-success">{t`Group created`}</p>
        {group.reviewStatus === "PENDING" ? (
          <p className="text-sm text-muted">{t`Pending`}</p>
        ) : null}
        <ListCardBody
          title={group.name}
          titleIcon={<UsersRound className="size-5 text-accent" aria-hidden />}
        />
        <WidgetLink app={app} path={`/groups/${group.id}`}>{t`Open group`}</WidgetLink>
      </Card.Content>
    </ListCard>
  );
}
