import { EventDateTimeField } from "./EventDateTimeField";
export function EventWallDateTime(props: {
  label: string;
  value: string;
  timeZone: string;
  help?: string;
  min?: string;
  max?: string;
  error?: string;
  isDisabled?: boolean;
  onChange: (value: string) => void;
}) {
  return <EventDateTimeField {...props} mode="datetime" />;
}
