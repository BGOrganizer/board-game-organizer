"use client";

import { Link } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { useLingui } from "@lingui/react";
import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { inviteMessages as messages } from "./inviteMessages";

export function InviteAppLink({ token, production }: { token: string; production: boolean }) {
  const { i18n } = useLingui();
  const [scheme, setScheme] = useState(production ? "bgo" : "bgo-dev");
  useEffect(() => {
    setScheme(
      production || /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) ? "bgo" : "bgo-dev",
    );
  }, [production]);
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  return (
    <div style={{ maxWidth: 640, padding: "24px 24px 0", margin: "0 auto" }}>
      <Link
        className={buttonVariants({ variant: "secondary" })}
        href={`${scheme}:///invite/${token}`}
      >
        <Smartphone size={18} aria-hidden="true" />
        {i18n._(messages.openApp)}
      </Link>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>{i18n._(messages.openAppHint)}</p>
    </div>
  );
}
