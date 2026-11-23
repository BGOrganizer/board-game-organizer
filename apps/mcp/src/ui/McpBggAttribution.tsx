import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useState } from "react";
import { BggAttribution } from "@/components/profile/BggAttribution";
import bggLogo from "../../../web/public/bgg-powered.png?inline";

export function McpBggAttribution({ app }: { app: App }) {
  const { t } = useLingui();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <BggAttribution
        onOpen={() => {
          void app.openLink({ url: "https://boardgamegeek.com" }).then(
            (result) => setFailed(Boolean(result.isError)),
            () => setFailed(true),
          );
        }}
      >
        <img
          src={bggLogo}
          width={120}
          height={40}
          alt={t`Powered by BGG`}
          className="h-10 w-30 object-contain"
        />
      </BggAttribution>
      {failed ? (
        <p role="alert" className="text-sm text-danger">{t`Something went wrong`}</p>
      ) : null}
    </>
  );
}
