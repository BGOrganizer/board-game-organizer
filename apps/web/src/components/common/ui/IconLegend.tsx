import type { LucideIcon } from "lucide-react";

export function IconLegend({
  items,
}: {
  items: readonly { icon: LucideIcon; description: string }[];
}) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map(({ icon: Icon, description }) => (
        <li key={description} className="flex items-start gap-2">
          <Icon className="size-4 shrink-0 text-default-500" aria-hidden />
          <span>{description}</span>
        </li>
      ))}
    </ul>
  );
}
