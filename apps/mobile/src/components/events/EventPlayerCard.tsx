import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { View } from "react-native";
import { ListCard } from "@/components/common/ui/ListCard";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
export function EventPlayerCard({
  name,
  username,
  avatarUrl,
  children,
  footer,
}: {
  name: string | undefined;
  username?: string | null;
  avatarUrl: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ListCard>
      <View style={{ padding: 12, gap: 12 }}>
        {name === undefined ? (
          <Skeleton style={{ width: "100%", height: 48, borderRadius: 8 }} />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <UserAvatar name={name || "?"} avatarUrl={avatarUrl} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Typography className="font-semibold text-foreground">{name}</Typography>
              <Typography className="text-sm text-muted" numberOfLines={1}>
                {username ? `@${username}` : "—"}
              </Typography>
            </View>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 8 }}>{children}</View>
        {footer}
      </View>
    </ListCard>
  );
}
