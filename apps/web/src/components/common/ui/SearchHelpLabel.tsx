import { Label, Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleHelp } from "lucide-react";

export function SearchHelpLabel({
  label,
  help,
  helpTitle,
  htmlFor,
}: {
  label: string;
  help: string;
  helpTitle?: string;
  htmlFor?: string;
}) {
  const { t } = useLingui();
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Popover>
        <Popover.Trigger
          aria-label={`${label}: ${helpTitle ?? t`Search help`}`}
          className="inline-flex size-8 items-center justify-center rounded-full text-default-500 hover:text-foreground"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Content placement="bottom start" className="w-64 max-w-[calc(100vw-2rem)]">
          <Popover.Dialog className="whitespace-normal break-words p-3 text-sm">
            {help}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}
