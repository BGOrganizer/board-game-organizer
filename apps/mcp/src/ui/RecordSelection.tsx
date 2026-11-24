import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  type CardNavigation,
  cardNavigationClassName,
} from "@/components/common/ui/LinkedListCardLayout";
import { McpGameListRow } from "./McpGameListRow";
import { record } from "./protocol";
import { RecordResultCard } from "./RecordResultCard";
import { isRecordListOperation, RecordResults, readSelectedRecord } from "./RecordResults";
import { useWidgetNavigation } from "./WidgetNavigation";

export function RecordSelection({
  app,
  view,
  viewerUserId,
}: {
  app: App;
  view: unknown;
  viewerUserId?: string;
}) {
  const { t } = useLingui();
  const { openPath } = useWidgetNavigation(app);
  const payload = record(view);
  if (
    payload?.mode === "browse" &&
    typeof payload.operation === "string" &&
    isRecordListOperation(payload.operation)
  ) {
    return (
      <RecordResults
        app={app}
        operation={payload.operation}
        data={payload.page}
        input={payload.input}
        viewerUserId={viewerUserId}
        renderGameRow={(game) => <McpGameListRow app={app} game={game} />}
      />
    );
  }

  const rows =
    payload?.mode === "selection" && Array.isArray(payload.rows)
      ? payload.rows.map(readSelectedRecord)
      : [];
  if (!rows.length || !rows.every((row) => row !== undefined)) {
    return <p role="alert" className="text-danger">{t`Something went wrong`}</p>;
  }
  const renderNavigation: CardNavigation = ({ href, label, description, disabled }) => (
    <Button
      variant="ghost"
      aria-label={label}
      aria-description={description}
      isDisabled={disabled}
      onPress={() => void openPath(href)}
      className={`${cardNavigationClassName} h-full w-full p-0`}
    />
  );
  return (
    <section aria-label={t`Results`} className="space-y-3">
      {rows.map((row) => (
        <RecordResultCard
          key={`${row.kind}:${row.data.id}`}
          row={row}
          renderNavigation={renderNavigation}
          viewerUserId={viewerUserId}
          renderGameRow={(game) => <McpGameListRow app={app} game={game} />}
        />
      ))}
    </section>
  );
}
