import type { ReactNode } from "react";
export function ListCardBody({
  title,
  titleIcon,
  titleAccessory,
  children,
}: {
  title: string;
  titleIcon?: ReactNode;
  titleAccessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-center gap-2">
        {titleIcon}
        <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
        {titleAccessory}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
