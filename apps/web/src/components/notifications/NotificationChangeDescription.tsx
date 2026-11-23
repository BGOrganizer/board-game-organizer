import type { NotificationChangeRow } from "@board-game-organizer/schemas";

export function NotificationChangeDescription({
  change,
}: {
  change: Pick<NotificationChangeRow, "title" | "description">;
}) {
  return (
    <div className="space-y-1">
      <p className="font-semibold">{change.title}</p>
      <p>{change.description}</p>
    </div>
  );
}
