import type { OptionVoteVoters as Voters } from "@board-game-organizer/schemas";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, Minus, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { useT } from "@/lib/i18n";
import { VoteResultSheet } from "./VoteResultSheet";

export function OptionVoteVoters({ label, voters }: { label: string; voters: Voters }) {
  const t = useT();
  const [selection, setSelection] = useState<keyof Voters | null>(null);
  const [success, warning, danger] = useThemeColor(["success", "warning", "danger"]);
  const choices = [
    { id: "YES", text: t("Yes"), Icon: Check, color: success },
    { id: "IF_NEEDED", text: t("If needed"), Icon: Minus, color: warning },
    { id: "NO", text: t("No"), Icon: X, color: danger },
  ] as const;
  const groups = choices.filter(({ id }) => voters[id].length);

  return (
    <>
      {groups.length ? (
        <View
          accessibilityLabel={`${t("Votes")}: ${label}`}
          style={{ flexDirection: "row", flexWrap: "wrap" }}
        >
          {groups.map(({ id, text, Icon, color }, index) => (
            <View key={id} style={{ flexDirection: "row", alignItems: "center", maxWidth: "100%" }}>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                accessibilityLabel={`${label}: ${t("Show votes")} — ${text}`}
                style={{ width: 44, height: 44, paddingHorizontal: 2, justifyContent: "flex-end" }}
                onPress={() => setSelection(id)}
              >
                <Icon size={16} color={color} accessible={false} />
              </Button>
              {index > 0 ? (
                <View
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="bg-muted"
                  style={{
                    position: "absolute",
                    alignSelf: "center",
                    start: 12,
                    width: 3,
                    height: 3,
                    borderRadius: 2,
                  }}
                />
              ) : null}
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ flexDirection: "row", flexWrap: "wrap", flexShrink: 1, paddingStart: 4 }}
              >
                {voters[id].map((person) => {
                  const name =
                    person.guestName ??
                    person.name ??
                    (person.username ? `@${person.username}` : t("Unknown"));
                  return (
                    <Avatar
                      key={person.userId}
                      alt={name}
                      accessible={false}
                      style={{ width: 16, height: 16, marginStart: -4 }}
                    >
                      {person.guestName ? (
                        <GuestAvatar name={person.guestName} />
                      ) : (
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
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {selection ? (
        <VoteResultSheet
          label={label}
          voters={voters}
          initialVote={selection}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </>
  );
}
