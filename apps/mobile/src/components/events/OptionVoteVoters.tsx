import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { Avatar } from "heroui-native/avatar";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { Check, Minus, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";

type Voters = NonNullable<PlannedTableResponse["gameVoteVoters"]>[string];

export function OptionVoteVoters({
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
        {groups.map(({ id, text, Icon, color }) => {
          const paired = voters[id].length === 2;
          return (
            <View
              key={id}
              accessibilityLabel={`${text}: ${voters[id].map(displayName).join(", ")}`}
              style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2 }}
            >
              <View
                pointerEvents="none"
                style={paired ? { zIndex: 1, transform: [{ translateX: 20 }] } : undefined}
              >
                <Icon size={16} color={color} accessible={false} />
              </View>
              {voters[id].map((person, index) => {
                const name = displayName(person);
                const username = person.name && person.username ? `@${person.username}` : undefined;
                const guestAvatar = person.guestName ? (
                  <GuestAvatar name={person.guestName} />
                ) : undefined;
                return (
                  <Popover key={person.userId}>
                    <Popover.Trigger
                      accessibilityLabel={`${name} (${text})`}
                      style={{
                        width: 44,
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Avatar
                        alt={name}
                        accessible={false}
                        style={{
                          width: 16,
                          height: 16,
                          transform: paired ? [{ translateX: index === 0 ? 12 : -12 }] : undefined,
                        }}
                      >
                        {guestAvatar ?? (
                          <>
                            {person.avatarUrl ? (
                              <Avatar.Image source={{ uri: person.avatarUrl }} />
                            ) : null}
                            <Avatar.Fallback>
                              <Typography className="text-foreground" style={{ fontSize: 10 }}>
                                {name.replace(/^@/, "").charAt(0)}
                              </Typography>
                            </Avatar.Fallback>
                          </>
                        )}
                      </Avatar>
                    </Popover.Trigger>
                    <Popover.Portal unstable_accessibilityContainerViewIsModal>
                      <Popover.Overlay />
                      <Popover.Content
                        presentation="popover"
                        placement="bottom"
                        width={260}
                        testID="vote-voter-popover"
                        accessible
                        accessibilityLabel={username ? `${name}, ${username}` : name}
                      >
                        <UserListRow
                          name={name}
                          avatarUrl={person.avatarUrl}
                          avatarContent={guestAvatar}
                          secondary={username}
                        />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover>
                );
              })}
            </View>
          );
        })}
      </View>
    );
  }

  return <VoterTabs voters={voters} choices={choices} displayName={displayName} />;
}

function VoterTabs({
  voters,
  choices,
  displayName,
}: {
  voters: Voters;
  choices: readonly { id: keyof Voters; text: string; Icon: typeof Check; color: string }[];
  displayName: (person: Voters["YES"][number]) => string;
}) {
  const t = useT();
  const [selection, setSelection] = useState("YES");
  return (
    <Tabs value={selection} onValueChange={setSelection} style={{ flex: 1 }}>
      <TabBar>
        {choices.map(({ id, text, Icon, color }) => (
          <TabTrigger key={id} value={id} icon={Icon} iconColor={color}>
            <Tabs.Label>{text}</Tabs.Label>
          </TabTrigger>
        ))}
      </TabBar>
      {choices.map(({ id }) => (
        <RetainedTabPanel key={id} active={id === selection}>
          <InputFlatList
            data={voters[id]}
            keyExtractor={(person) => person.userId}
            ListEmptyComponent={
              <Typography className="p-3 text-sm text-muted">{t("No votes")}</Typography>
            }
            renderItem={({ item: person }) => (
              <GroupedList>
                <GroupedRow>
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
              </GroupedList>
            )}
          />
        </RetainedTabPanel>
      ))}
    </Tabs>
  );
}
