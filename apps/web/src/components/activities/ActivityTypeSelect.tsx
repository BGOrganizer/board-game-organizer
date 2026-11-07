"use client";
import { type ProfileActivityKind, profileActivityKindSchema } from "@board-game-organizer/schemas";
import { Label, ListBox, Select } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function ActivityTypeSelect({
  value,
  onChange,
}: {
  value?: ProfileActivityKind;
  onChange: (kind?: ProfileActivityKind) => void;
}) {
  const { t } = useLingui();
  const labels: Record<ProfileActivityKind, string> = {
    played: t`Game played`,
    friendship: t`New friendship`,
    event_join: t`Joined an event`,
    table_join: t`Joined a table`,
    group_join: t`Joined a group`,
    follower: t`New follower`,
    milestone: t`Victory milestone`,
  };
  return (
    <Select
      value={value ?? "all"}
      onChange={(key) => {
        const parsed = profileActivityKindSchema.safeParse(key);
        onChange(parsed.success ? parsed.data : undefined);
      }}
    >
      <Label>{t`Activity type`}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="all" textValue={t`All activity types`}>
            {t`All activity types`}
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {profileActivityKindSchema.options.map((kind) => (
            <ListBox.Item key={kind} id={kind} textValue={labels[kind]}>
              {labels[kind]}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
