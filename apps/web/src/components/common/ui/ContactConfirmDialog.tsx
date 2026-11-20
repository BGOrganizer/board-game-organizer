"use client";

import { Button, CloseButton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DialogAction {
  label: string;
  variant?: "primary" | "danger" | "danger-soft";
  icon?: ReactNode;
  onPress: () => void;
}

export function ContactConfirmDialog({
  title,
  description,
  busy,
  actions,
  onCancel,
  children,
}: {
  title: string;
  description: string;
  busy?: boolean;
  actions: DialogAction[];
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const [mounted, setMounted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const element = dialog.current;
    element?.showModal();
    cancelButton.current?.focus();
    return () => {
      const active = document.activeElement;
      element?.close();
      if (
        previousFocus.current?.isConnected &&
        (active === document.body || (active && element?.contains(active)))
      )
        previousFocus.current.focus({ preventScroll: true });
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialog}
      style={{ height: "var(--app-visible-height, 100dvh)" }}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-4 backdrop:bg-transparent"
    >
      <div
        className="absolute inset-0 bg-backdrop"
        onClick={busy ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        data-form-scope
        className="relative z-10 max-h-[calc(var(--app-visible-height,100dvh)_-_2rem)] w-full max-w-sm overflow-y-auto rounded-xl bg-overlay p-4 text-overlay-foreground shadow-overlay sm:p-5"
      >
        <div className="flex justify-end">
          <CloseButton
            ref={cancelButton}
            aria-label={t`Cancel`}
            className="min-h-11 min-w-11"
            isDisabled={busy}
            onPress={onCancel}
          >
            <X className="size-5" aria-hidden />
          </CloseButton>
        </div>
        <h2 id={titleId} className="text-lg font-semibold text-overlay-foreground">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-muted">
          {description}
        </p>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex items-stretch justify-end gap-3">
          {actions.map((action) => (
            <Button
              key={action.label}
              data-form-submit
              className="h-auto min-h-11 min-w-11 shrink gap-2 py-2 whitespace-normal text-center"
              variant={action.variant ?? "primary"}
              size="md"
              isDisabled={busy}
              onPress={action.onPress}
            >
              {action.icon}
              <span className="min-w-0 [overflow-wrap:anywhere]">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
