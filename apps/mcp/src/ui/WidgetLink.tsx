import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { openWeb } from "./protocol";

export function WidgetLink({
  app,
  path,
  children,
}: {
  app: App;
  path: string;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const [failed, setFailed] = useState(false);

  async function open() {
    try {
      setFailed(!(await openWeb(app, path)));
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onPress={() => void open()}>
        <ExternalLink className="size-4" aria-hidden />
        {children}
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-danger">{t`Something went wrong`}</p>
      ) : null}
    </>
  );
}
