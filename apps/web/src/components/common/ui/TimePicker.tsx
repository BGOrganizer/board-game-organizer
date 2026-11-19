"use client";

import { I18nProvider, TimeField } from "@heroui/react";
import { parseTime } from "@internationalized/date";
import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  children?: ReactNode;
  "aria-label"?: string;
  name?: string;
  className?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  minValue?: string;
  maxValue?: string;
}

function parseClockTime(value?: string) {
  if (!value) return null;
  try {
    return parseTime(value);
  } catch {
    return null;
  }
}

/** For fields whose calendar day is already fixed by their parent event. */
export function TimePicker({
  value,
  onChange,
  label,
  children,
  minValue,
  maxValue,
  ...props
}: TimePickerProps) {
  const { i18n } = useLingui();
  // Keep intermediate segments editable when a bounded form rejects their partial value.
  const [clock, setClock] = useState(() => ({ source: value, value: parseClockTime(value) }));
  if (clock.source !== value) setClock({ source: value, value: parseClockTime(value) });
  return (
    <I18nProvider locale={i18n.locale}>
      <TimeField
        {...props}
        data-form-field
        data-form-error={props.isInvalid || undefined}
        className={`w-full min-w-0 ${props.className ?? ""}`}
        value={clock.source === value ? clock.value : parseClockTime(value)}
        onChange={(time) => {
          setClock({ source: value, value: time });
          onChange(time?.toString().slice(0, 5) ?? "");
        }}
        onBlur={() => setClock({ source: value, value: parseClockTime(value) })}
        minValue={parseClockTime(minValue) ?? undefined}
        maxValue={parseClockTime(maxValue) ?? undefined}
        hourCycle={24}
        granularity="minute"
      >
        {label}
        <TimeField.Group role="presentation">
          <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
        </TimeField.Group>
        {children}
      </TimeField>
    </I18nProvider>
  );
}
