import { Accordion } from "heroui-native/accordion";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { View } from "react-native";
import { GroupedRow } from "./GroupedRow";

export type GroupedRowDisclosure = { label: string; indicatorLabel: string; content: ReactNode };

export function ExpandableGroupedRow({
  disclosure,
  summary,
  actions,
}: {
  disclosure: GroupedRowDisclosure;
  summary: ReactNode;
  actions?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  return (
    <Accordion hideSeparator>
      <Accordion.Item value="details">
        <GroupedRow>
          <View
            style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            {summary}
          </View>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Accordion.Trigger
              accessibilityLabel={disclosure.label}
              style={{ minHeight: 44, minWidth: 44, justifyContent: "center", gap: 6, padding: 0 }}
            >
              <Typography className="text-xs text-muted">{disclosure.indicatorLabel}</Typography>
              <Accordion.Indicator iconProps={{ size: 16, color: muted }} />
            </Accordion.Trigger>
            {actions}
          </View>
        </GroupedRow>
        <Accordion.Content style={{ paddingTop: 0, paddingRight: 12, paddingLeft: 16 }}>
          {disclosure.content}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
