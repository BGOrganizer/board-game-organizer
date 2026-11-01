"use client";
import { useAppStore } from "@board-game-organizer/store";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

type Pulse = { owner: string; itemId: string; signal?: string };
/** Overlay only: no added border width, layout shift, pointer interception or domain acknowledgement. */
export function NotificationAttentionBorder({ active, pulse }: { active: boolean; pulse?: Pulse }) {
  const { t } = useLingui();
  if (!active) return null;
  return (
    <span className="notification-attention-border" role="img" aria-label={t`Needs attention`}>
      {pulse ? <PulseLayer {...pulse} /> : null}
    </span>
  );
}
function PulseLayer({ owner, itemId, signal }: Pulse) {
  const claim = useAppStore((state) => state.claimAttentionPulse);
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [environment, setEnvironment] = useState<{ foreground: boolean; reduced: boolean }>();
  const [run, setRun] = useState<string>();
  const key = JSON.stringify([owner, itemId, signal]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const refresh = () =>
      setEnvironment({
        foreground: document.visibilityState === "visible",
        reduced: media.matches,
      });
    refresh();
    media.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      media.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const foreground = environment?.foreground,
    reduced = environment?.reduced;
  useEffect(() => {
    if (!signal || !visible || !foreground) {
      setRun(undefined);
      return;
    }
    // Reduced motion consumes the UI presentation mark too: turning motion back on is not a new notice.
    const first = claim(owner, itemId, signal);
    if (first && !reduced) setRun(key);
    else setRun((current) => (!reduced && current === key ? current : undefined));
  }, [owner, itemId, signal, key, claim, visible, foreground, reduced]);
  return (
    <span ref={ref} className="notification-attention-pulse-host" aria-hidden="true">
      {run && run === key ? (
        <span
          key={run}
          className="notification-attention-pulse"
          onAnimationEnd={() => setRun(undefined)}
        />
      ) : null}
    </span>
  );
}
