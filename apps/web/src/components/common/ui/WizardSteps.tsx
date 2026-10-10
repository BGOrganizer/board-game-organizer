"use client";
import { useLingui } from "@lingui/react/macro";

export function WizardSteps({ current, count }: { current: number; count: number }) {
  const { t } = useLingui();
  return (
    <ol aria-label={t`Steps`} className="mb-4 flex items-center justify-center gap-2 text-sm">
      {Array.from({ length: count }, (_, i) => i + 1).map((step) => (
        <li
          key={step}
          aria-current={current === step ? "step" : undefined}
          className={`rounded-full px-3 py-1 ${current === step ? "bg-accent text-accent-foreground" : "bg-default-100 text-default-500"}`}
        >
          {step}
        </li>
      ))}
    </ol>
  );
}
