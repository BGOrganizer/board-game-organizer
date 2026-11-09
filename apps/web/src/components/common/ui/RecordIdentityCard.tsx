import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ListCard } from "./ListCard";

/** Full title first; informational controls wrap below without horizontal scrolling. */
export function RecordIdentityCard({
  title,
  heading: Heading = "h1",
  icon: Icon,
  background,
  titleAccessory,
  children,
}: {
  title: string;
  heading?: "h1" | "h2";
  icon: LucideIcon;
  background: ReactNode;
  titleAccessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ListCard background={background}>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3 p-4">
        <div className="dark relative isolate flex max-w-full items-start gap-2 text-foreground">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-8 -z-10 bg-[linear-gradient(to_right,transparent,var(--background)_32px,var(--background)_calc(100%_-_32px),transparent)] opacity-90 [mask-image:linear-gradient(to_bottom,transparent,var(--foreground)_32px,var(--foreground)_calc(100%_-_32px),transparent)]"
          />
          <Icon className="mt-1 size-5 shrink-0" aria-hidden />
          <Heading className="min-w-0 text-lg font-semibold text-foreground [overflow-wrap:anywhere] [text-shadow:0_1px_3px_var(--background)]">
            {title}
          </Heading>
          {titleAccessory}
        </div>
        <div className="relative flex w-full min-w-0 flex-wrap items-center [&>*]:shrink-0">
          {children}
        </div>
      </div>
    </ListCard>
  );
}
