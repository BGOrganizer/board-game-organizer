"use client";

import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
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
  cancelLast = false,
  actionsInRow = false,
  cancelIcon,
  children,
}: {
  title: string;
  description: string;
  busy?: boolean;
  actions: DialogAction[];
  onCancel: () => void;
  cancelLast?: boolean;
  actionsInRow?: boolean;
  cancelIcon?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const [mounted, setMounted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = `${titleId}-description`;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    const element = dialog.current;
    element?.showModal();
    cancelButton.current?.focus();
    return () => element?.close();
  }, [mounted]);

  if (!mounted) return null;
  const buttonClassName = actionsInRow
    ? "min-h-11 min-w-11 flex-1 flex-row gap-2 px-2 whitespace-normal text-center text-base"
    : "w-full sm:w-auto";
  const cancel = (
    <Button
      className={cancelLast && actionsInRow ? "min-h-11" : buttonClassName}
      variant="ghost"
      ref={cancelButton}
      isDisabled={busy}
      onPress={onCancel}
    >
      {cancelIcon}
      {t`Cancel`}
    </Button>
  );
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
        <h2 id={titleId} className="text-lg font-semibold text-overlay-foreground">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-muted">
          {description}
        </p>
        {children ? <div className="mt-4">{children}</div> : null}
        <div
          className={
            actionsInRow
              ? "mt-5 flex flex-row gap-1"
              : cancelLast
                ? "mt-5 flex flex-col gap-2"
                : "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end"
          }
        >
          {!cancelLast ? cancel : null}
          {actions.map((action) => (
            <Button
              key={action.label}
              data-form-submit
              className={buttonClassName}
              variant={action.variant ?? "primary"}
              size="md"
              isDisabled={busy}
              onPress={action.onPress}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
          {cancelLast && !actionsInRow ? cancel : null}
        </div>
        {cancelLast && actionsInRow ? <div className="mt-3 flex justify-end">{cancel}</div> : null}
      </div>
    </dialog>,
    document.body,
  );
}
