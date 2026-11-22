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
  overlay,
  actions,
}: {
  disclosure: GroupedRowDisclosure;
  summary: ReactNode;
  overlay?: ReactNode;
  actions?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  return (
    <Accordion hideSeparator>
      <Accordion.Item value="details">
        <GroupedRow>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Accordion.Trigger
              accessibilityLabel={disclosure.label}
              style={{ minHeight: 44, gap: 8, padding: 0 }}
            >
              {summary}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Typography className="text-xs text-muted">{disclosure.indicatorLabel}</Typography>
                <Accordion.Indicator iconProps={{ size: 16, color: muted }} />
              </View>
            </Accordion.Trigger>
            {overlay}
          </View>
          {actions}
        </GroupedRow>
        <Accordion.Content style={{ paddingTop: 0, paddingRight: 12, paddingLeft: 16 }}>
          {disclosure.content}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
