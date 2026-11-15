import { Clock3, Mail } from "lucide-react";

export function PendingArtworkBadge({
  kind,
  label,
}: {
  kind: "invitation" | "request";
  label: string;
}) {
  const Icon = kind === "invitation" ? Mail : Clock3;
  return (
    <span
      role="img"
      aria-label={label}
      className="absolute bottom-0 right-0 rounded-tl-lg bg-surface p-1 text-warning"
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
