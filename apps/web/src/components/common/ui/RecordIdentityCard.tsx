import type { ReactNode } from "react";
import { ListCard } from "./ListCard";

/** One image-backed HeroUI identity; title and informational controls remain over the artwork. */
export function RecordIdentityCard({
  title,
  icon,
  background,
  titleAccessory,
  children,
}: {
  title: string;
  icon: ReactNode;
  background: ReactNode;
  titleAccessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ListCard background={background}>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-1 basis-48 items-start gap-2">
          {icon}
          <h1 className="min-w-0 flex-1 break-words text-lg font-semibold text-foreground">
            {title}
          </h1>
          {titleAccessory}
        </div>
        <div className="relative ml-auto max-w-full overflow-x-auto overscroll-x-contain p-1">
          <div className="flex w-max min-w-full flex-nowrap items-center justify-end [&>*]:shrink-0">
            {children}
          </div>
        </div>
      </div>
    </ListCard>
  );
}
