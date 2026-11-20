import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { Avatar } from "heroui-native/avatar";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, Minus, X } from "lucide-react-native";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { useT } from "@/lib/i18n";

type Voters = NonNullable<PlannedTableResponse["gameVoteVoters"]>[string];

export function GameVoteVoters({
  label,
  voters,
  compact = false,
}: {
  label: string;
  voters: Voters;
  compact?: boolean;
}) {
  const t = useT();
  const [success, warning, danger] = useThemeColor(["success", "warning", "danger"]);
  const choices = [
    { id: "YES", text: t("Yes"), Icon: Check, color: success },
    { id: "IF_NEEDED", text: t("If needed"), Icon: Minus, color: warning },
    { id: "NO", text: t("No"), Icon: X, color: danger },
  ] as const;
  const displayName = ({ name, username, guestName }: Voters["YES"][number]) =>
    guestName ?? name ?? (username ? `@${username}` : t("Unknown"));
  if (compact) {
    const groups = choices.filter(({ id }) => voters[id].length);
    if (!groups.length) return null;
    return (
      <View
        accessibilityLabel={`${t("Votes")}: ${label}`}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        {groups.map(({ id, text, Icon, color }) => (
          <View
            key={id}
            accessible
            accessibilityLabel={`${text}: ${voters[id].map(displayName).join(", ")}`}
            style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2 }}
          >
            <Icon size={12} color={color} accessible={false} />
            {voters[id].map((person) => (
              <Avatar
                key={person.userId}
                alt={displayName(person)}
                accessible={false}
                style={{ width: 12, height: 12 }}
              >
                {person.guestName ? (
                  <GuestAvatar name={person.guestName} />
                ) : (
                  <>
                    {person.avatarUrl ? <Avatar.Image source={{ uri: person.avatarUrl }} /> : null}
                    <Avatar.Fallback>
                      <Typography className="text-foreground" style={{ fontSize: 8 }}>
                        {displayName(person).replace(/^@/, "").charAt(0)}
                      </Typography>
                    </Avatar.Fallback>
                  </>
                )}
              </Avatar>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {choices.map(({ id, text, Icon, color }) => (
        <View key={id} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon size={18} color={color} accessible={false} />
            <Typography accessible accessibilityRole="header" className="text-sm font-semibold">
              {text}
            </Typography>
          </View>
          {voters[id].length ? (
            <GroupedList>
              {voters[id].map((person) => (
                <GroupedRow key={person.userId}>
                  <UserAvatar
                    name={displayName(person)}
                    avatarUrl={person.avatarUrl}
                    avatarContent={
                      person.guestName ? <GuestAvatar name={person.guestName} /> : undefined
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Typography className="text-sm font-medium">{displayName(person)}</Typography>
                    {person.name && person.username ? (
                      <Typography className="text-xs text-muted">@{person.username}</Typography>
                    ) : null}
                  </View>
                </GroupedRow>
              ))}
            </GroupedList>
          ) : (
            <Typography className="text-sm text-muted" style={{ paddingLeft: 26 }}>
              {t("No votes")}
            </Typography>
          )}
        </View>
      ))}
    </View>
  );
}
