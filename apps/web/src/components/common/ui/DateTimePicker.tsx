"use client";

import {
  Button,
  Calendar,
  DateField,
  DatePicker,
  I18nProvider,
  Popover,
  TimeField,
} from "@heroui/react";
import { parseDateTime } from "@internationalized/date";
import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  children?: ReactNode;
  "aria-label"?: string;
  id?: string;
  name?: string;
  className?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  minValue?: string;
  maxValue?: string;
}

function parseWallTime(value?: string) {
  if (!value) return null;
  try {
    return parseDateTime(value);
  } catch {
    return null;
  }
}

/** Keeps location-local wall time intact: timezone conversion belongs to the form/domain. */
export function DateTimePicker({
  value,
  onChange,
  label,
  children,
  minValue,
  maxValue,
  ...props
}: DateTimePickerProps) {
  const { t, i18n } = useLingui();
  // Preserve in-progress segments while the form rejects an out-of-bounds date.
  const [selection, setSelection] = useState(() => ({
    source: value,
    value: parseWallTime(value),
  }));
  if (selection.source !== value) setSelection({ source: value, value: parseWallTime(value) });
  return (
    <I18nProvider locale={i18n.locale}>
      <DatePicker
        {...props}
        data-form-field
        data-form-error={props.isInvalid || undefined}
        className={`w-full min-w-0 ${props.className ?? ""}`}
        value={selection.source === value ? selection.value : parseWallTime(value)}
        onChange={(date) => {
          setSelection({ source: value, value: date });
          onChange(date?.toString().slice(0, 16) ?? "");
        }}
        onBlur={() => setSelection({ source: value, value: parseWallTime(value) })}
        onOpenChange={(open) => {
          if (!open) setSelection({ source: value, value: parseWallTime(value) });
        }}
        minValue={parseWallTime(minValue) ?? undefined}
        maxValue={parseWallTime(maxValue) ?? undefined}
        granularity="minute"
        hourCycle={24}
        shouldCloseOnSelect={false}
      >
        {({ state }) => (
          <>
            {label}
            <DateField.Group>
              <DateField.Input>
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
              <DateField.Suffix>
                <DatePicker.Trigger aria-label={t`Choose date and time`}>
                  <DatePicker.TriggerIndicator />
                </DatePicker.Trigger>
              </DateField.Suffix>
            </DateField.Group>
            {children}
            <DatePicker.Popover>
              <Popover.Dialog className="space-y-3 p-3" aria-label={t`Choose date and time`}>
                <Calendar aria-label={t`Choose date`}>
                  <Calendar.Header>
                    <Calendar.YearPickerTrigger>
                      <Calendar.YearPickerTriggerHeading />
                      <Calendar.YearPickerTriggerIndicator />
                    </Calendar.YearPickerTrigger>
                    <Calendar.NavButton slot="previous" />
                    <Calendar.NavButton slot="next" />
                  </Calendar.Header>
                  <Calendar.Grid>
                    <Calendar.GridHeader>
                      {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                    </Calendar.GridHeader>
                    <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                  </Calendar.Grid>
                  <Calendar.YearPickerGrid>
                    <Calendar.YearPickerGridBody>
                      {({ year }) => <Calendar.YearPickerCell year={year} />}
                    </Calendar.YearPickerGridBody>
                  </Calendar.YearPickerGrid>
                </Calendar>
                <TimeField
                  aria-label={t`Time`}
                  value={state.timeValue}
                  onChange={(time) => {
                    if (time) state.setTimeValue(time);
                    else state.setValue(null);
                  }}
                  hourCycle={24}
                  granularity="minute"
                  isDisabled={props.isDisabled}
                >
                  <TimeField.Group role="presentation">
                    <TimeField.Input>
                      {(segment) => <TimeField.Segment segment={segment} />}
                    </TimeField.Input>
                  </TimeField.Group>
                </TimeField>
                <Button
                  slot={null}
                  className="w-full"
                  variant="primary"
                  onPress={() => state.setOpen(false)}
                >
                  {t`Done`}
                </Button>
              </Popover.Dialog>
            </DatePicker.Popover>
          </>
        )}
      </DatePicker>
    </I18nProvider>
  );
}
