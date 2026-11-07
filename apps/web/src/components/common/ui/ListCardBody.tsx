import type { ReactNode } from "react";
import { NotificationUnreadDot } from "./NotificationUnreadDot";
export function ListCardBody({
  title,
  titleIcon,
  titleAccessory,
  unread = false,
  children,
}: {
  title: string;
  titleIcon?: ReactNode;
  titleAccessory?: ReactNode;
  unread?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-center gap-2">
        {titleIcon}
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate font-semibold">{title}</span>
          <NotificationUnreadDot active={unread} />
        </span>
        {titleAccessory}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
