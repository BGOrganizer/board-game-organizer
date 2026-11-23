import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import type { ReactNode } from "react";
import { useState } from "react";
import { useWidgetNavigation } from "./WidgetNavigation";

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
  const { canOpenPath, openPath } = useWidgetNavigation(app);

  async function open() {
    try {
      const opened = await openPath(path);
      if (!canOpenPath(path)) setFailed(!opened);
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onPress={() => void open()}>
        {children}
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-danger">{t`Something went wrong`}</p>
      ) : null}
    </>
  );
}
