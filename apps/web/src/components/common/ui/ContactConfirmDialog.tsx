"use client";

import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface DialogAction {
  label: string;
  variant?: "primary" | "danger";
  icon?: ReactNode;
  onPress: () => void;
}

export function ContactConfirmDialog({
  title,
  description,
  busy,
  actions,
  onCancel,
  cancelLast = false,
  cancelIcon,
}: {
  title: string;
  description: string;
  busy?: boolean;
  actions: DialogAction[];
  onCancel: () => void;
  cancelLast?: boolean;
  cancelIcon?: ReactNode;
}) {
  const { t } = useLingui();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  if (!mounted) return null;
  const cancel = (
    <Button className="w-full sm:w-auto" variant="ghost" isDisabled={busy} onPress={onCancel}>
      {cancelIcon}
      {t`Cancel`}
    </Button>
  );
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={busy ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-confirm-title"
        className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl bg-background p-4 shadow-2xl sm:p-5"
      >
        <h2 id="contact-confirm-title" className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-2 text-sm text-default-500">{description}</p>
        <div
          className={
            cancelLast
              ? "mt-5 flex flex-col gap-2"
              : "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          }
        >
          {!cancelLast ? cancel : null}
          {actions.map((action) => (
            <Button
              key={action.label}
              className="w-full sm:w-auto"
              variant={action.variant ?? "primary"}
              isDisabled={busy}
              onPress={action.onPress}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
          {cancelLast ? cancel : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
