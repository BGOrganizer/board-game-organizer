"use client";

import type { EventVote } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react";
import { inviteMessages as messages } from "./inviteMessages";

export function InviteVotes({
  title,
  options,
  choices,
  editable,
  disabled,
  onChange,
}: {
  title: string;
  options: ReadonlyArray<{ id: string; label: string; description?: string }>;
  choices: Readonly<Record<string, EventVote>>;
  editable: boolean;
  disabled: boolean;
  onChange: (id: string, vote: Exclude<EventVote, "UNKNOWN">) => void;
}) {
  const { i18n } = useLingui();
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      {options.map((option) => (
        <fieldset key={option.id} style={{ minWidth: 0, border: 0, padding: 0, margin: 0 }}>
          <legend>{option.label}</legend>
          {option.description ? (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>{option.description}</p>
          ) : null}
          {editable && options.length > 1 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 8 }}>
              {(
                [
                  ["YES", messages.yes],
                  ["IF_NEEDED", messages.ifNeeded],
                  ["NO", messages.no],
                ] as const
              ).map(([vote, copy]) => (
                <Button
                  key={vote}
                  size="sm"
                  type="button"
                  variant={choices[option.id] === vote ? "primary" : "secondary"}
                  aria-label={`${option.label}: ${i18n._(copy)}`}
                  aria-pressed={choices[option.id] === vote}
                  isDisabled={disabled}
                  onPress={() => onChange(option.id, vote)}
                >
                  {i18n._(copy)}
                </Button>
              ))}
            </div>
          ) : null}
        </fieldset>
      ))}
    </section>
  );
}
