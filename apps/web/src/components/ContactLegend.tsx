import { Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleHelp, type LucideIcon } from "lucide-react";

export function ContactLegend({
  title,
  icon: Icon,
  entries,
}: {
  title: string;
  icon: LucideIcon;
  entries: { icon: LucideIcon; label: string; color: string; description: string }[];
}) {
  const { t } = useLingui();
  return (
    <div className="flex items-center gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </h2>
      <Popover>
        <Popover.Trigger
          aria-label={`${title}: ${t`Icon legend`}`}
          className="flex size-8 items-center justify-center rounded-lg text-default-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Content className="max-w-72">
          <Popover.Dialog>
            <Popover.Heading>{t`Icon legend`}</Popover.Heading>
            <ul className="mt-2 space-y-3">
              {entries.map(({ icon: BadgeIcon, label, color, description }) => (
                <li key={label} className="flex items-start gap-2">
                  <BadgeIcon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-default-500">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-center gap-2 text-xs">
              <span className="size-2 rounded-full bg-green-500" aria-hidden="true" />
              <span>{t`Online`}</span>
              <span className="ml-2 size-2 rounded-full bg-gray-300" aria-hidden="true" />
              <span>{t`Offline`}</span>
            </p>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}
