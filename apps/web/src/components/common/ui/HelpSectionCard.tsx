import { useLingui } from "@lingui/react/macro";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";

export function HelpSectionCard({
  title,
  label,
  icon: Icon,
  children,
}: {
  title: string;
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <SectionHeaderCard
      title={title}
      description={t`Section guide`}
      leading={
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      }
      action={
        <HelpPopover
          label={label}
          title={title}
          titleIcon={<Icon className="size-5" aria-hidden />}
          className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain"
        >
          <div className="space-y-3">{children}</div>
        </HelpPopover>
      }
    />
  );
}
