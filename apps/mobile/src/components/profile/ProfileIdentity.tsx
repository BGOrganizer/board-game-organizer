import { useUser } from "@clerk/expo";
import { useLingui } from "@lingui/react";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { useT } from "@/lib/i18n";

export function ProfileIdentity({
  name,
  username,
  avatarUrl,
  ownerId,
}: {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  ownerId?: string;
}) {
  return (
    <GroupedRow>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
          <UserAvatar name={name} avatarUrl={avatarUrl} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Typography className="font-medium text-foreground" numberOfLines={1}>
              {name}
            </Typography>
            {username ? (
              <Typography className="text-sm text-muted" numberOfLines={1}>
                @{username}
              </Typography>
            ) : null}
          </View>
        </View>
        {ownerId ? <JoinedAt ownerId={ownerId} /> : null}
      </View>
    </GroupedRow>
  );
}

function JoinedAt({ ownerId }: { ownerId: string }) {
  const { user, isLoaded } = useUser();
  const { i18n } = useLingui();
  const t = useT();
  const date = user?.id === ownerId ? user.createdAt : null;
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}
      testID="profile-joined-at"
    >
      <Typography className="text-sm text-muted">{t("Joined on")}:</Typography>
      {!isLoaded ? (
        <Skeleton
          accessibilityLabel={t("Loading…")}
          style={{ width: 112, height: 16, borderRadius: 4 }}
        />
      ) : (
        <Typography className="text-sm text-muted">
          {date ? i18n.date(date, { dateStyle: "long" }) : "—"}
        </Typography>
      )}
    </View>
  );
}
