import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { useThemeColor } from "heroui-native/hooks";
import { CalendarDays } from "lucide-react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { EventCardIndicators } from "./EventCardIndicators";

export function EventDetailsCard({ event }: { event: PlannedEventResponse }) {
  const foreground = useThemeColor("foreground");
  return (
    <RecordIdentityCard
      title={event.name}
      icon={<CalendarDays size={20} color={foreground} accessible={false} />}
      background={
        <AnimatedDicebearArtwork
          seed={event.id}
          variant="constellation"
          presentation="background"
        />
      }
    >
      <EventCardIndicators event={event} />
    </RecordIdentityCard>
  );
}
