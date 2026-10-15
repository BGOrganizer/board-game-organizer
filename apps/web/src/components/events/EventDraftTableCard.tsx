"use client";
import type { EventDraftTable } from "@board-game-organizer/shared";
import { Button, Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Pencil, Trash2 } from "lucide-react";
import { EventTableCardBody } from "./EventTableCardBody";

export function EventDraftTableCard({
  table,
  timeZone,
  busy,
  onEdit,
  onRemove,
}: {
  table: EventDraftTable;
  timeZone: string;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  return (
    <Card
      className="rounded-xl p-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
    >
      <EventTableCardBody
        table={table.input}
        timeZone={timeZone}
        gameName={table.gameName}
        imageUrl={table.imageUrl}
        demonstrator={table.demonstrator}
      />
      <div className="flex justify-end gap-2">
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          isDisabled={busy}
          aria-label={`${t`Edit table`}: ${table.input.name}`}
          onPress={onEdit}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="danger-soft"
          isDisabled={busy}
          aria-label={`${t`Remove table`}: ${table.input.name}`}
          onPress={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}
