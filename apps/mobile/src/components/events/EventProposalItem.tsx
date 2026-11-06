import type { EventProposalResponse } from "@board-game-organizer/schemas";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { MapPin } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GameListRow } from "@/components/games/GameListRow";

export function EventProposalItem({
  row,
  children,
  actions,
}: {
  row: EventProposalResponse;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  return (
    <View testID={`event-proposal-${row.id}`}>
      {row.payload.kind === "game" ? (
        <GameListRow
          name={row.game?.name ?? row.label}
          imageUrl={row.game?.imageUrl}
          actions={actions}
        >
          {children}
        </GameListRow>
      ) : (
        <GroupedRow>
          {row.payload.kind === "location" ? (
            <MapPin size={20} color={muted} accessible={false} />
          ) : null}
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {row.payload.kind === "date" ? (
              <DateTimeInfo
                startsAt={`${row.payload.day}T${row.payload.startTime}:00Z`}
                timeZone="UTC"
                dateStyle="medium"
              />
            ) : (
              <>
                <Typography className="font-medium text-foreground">
                  {row.payload.location.name}
                </Typography>
                <Typography className="text-sm text-muted">
                  {row.payload.location.address}
                </Typography>
              </>
            )}
            {children}
          </View>
          {actions}
        </GroupedRow>
      )}
    </View>
  );
}
