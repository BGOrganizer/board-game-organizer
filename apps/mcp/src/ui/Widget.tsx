import { Skeleton } from "@heroui/react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useLingui } from "@lingui/react/macro";
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { InviteCardView } from "@/components/invites/InviteCardView";
import { messages as en } from "../../../../messages/en.js";
import { messages as it } from "../../../../messages/it.js";
import { CatalogResults, supportsCatalogResult } from "./CatalogResults";
import { GroupCreated, groupResult } from "./GroupCreated";
import { GroupCreation } from "./GroupCreation";
import { LocationResults } from "./LocationResults";
import { McpGameListRow } from "./McpGameListRow";
import { OperationResult } from "./OperationResult";
import { PeopleResults, supportsPeopleResult } from "./PeopleResults";
import { record, type ToolOutput, toolOutput } from "./protocol";
import { RankingResults } from "./RankingResults";
import { isRecordResultOperation, RecordResults } from "./RecordResults";
import { TableFinalResults } from "./TableFinalResults";

const i18n = setupI18n({ locale: "en", messages: { en, it } });

type Response = { output: ToolOutput | undefined; input: unknown; sequence: number };

export function Widget() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
        },
      }),
  );
  return (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <WidgetResponse />
      </QueryClientProvider>
    </I18nProvider>
  );
}

function WidgetResponse() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [app] = useState(() => new App({ name: "Board Game Organizer", version: "1.0.0" }));
  const [response, setResponse] = useState<Response>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let input: unknown;
    let sequence = 0;
    let viewerUserId: string | undefined;

    function updateHost(context: McpUiHostContext | undefined) {
      if (context?.locale) {
        const locale = context.locale.toLowerCase().startsWith("it") ? "it" : "en";
        i18n.activate(locale);
        document.documentElement.lang = locale;
      }
      if (context?.theme) {
        document.documentElement.dataset.theme = context.theme;
        document.documentElement.classList.toggle("dark", context.theme === "dark");
        document.documentElement.classList.toggle("light", context.theme === "light");
      }
    }

    app.ontoolinput = (message) => {
      input = message.arguments;
    };
    app.ontoolresult = (result) => {
      if (!live) return;
      const output = toolOutput(result);
      if (output?.viewerUserId) {
        if (viewerUserId && viewerUserId !== output.viewerUserId) queryClient.clear();
        viewerUserId = output.viewerUserId;
      }
      setFailed(false);
      setResponse({ output, input, sequence: sequence++ });
    };
    app.onhostcontextchanged = (context) => updateHost(context);
    app.ontoolcancelled = () => {
      if (live) setFailed(true);
    };
    app.onteardown = async () => {
      live = false;
      return {};
    };
    void app.connect().then(
      () => {
        if (live) updateHost(app.getHostContext());
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
      void app.close();
    };
  }, [app, queryClient]);

  if (failed || (response && !response.output)) {
    return <p role="alert" className="text-danger">{t`Something went wrong`}</p>;
  }
  if (!response?.output) {
    return <Skeleton aria-label={t`Loading…`} className="h-20 w-full rounded-xl" />;
  }

  const { output, input, sequence } = response;
  if (isRecordResultOperation(output.operation)) {
    const table =
      output.operation === "get_table"
        ? output.data
        : output.operation === "save_table_result"
          ? record(output.data)?.table
          : undefined;
    return (
      <section key={sequence} className="space-y-3">
        <RecordResults
          app={app}
          operation={output.operation}
          data={output.data}
          input={input}
          viewerUserId={output.viewerUserId}
          renderGameRow={(game) => <McpGameListRow key={game.id} app={app} game={game} />}
        />
        {table ? <TableFinalResults data={table} /> : null}
      </section>
    );
  }
  if (
    output.operation === "list_global_leaderboard" ||
    output.operation === "list_group_leaderboard" ||
    output.operation === "list_table_leaderboard"
  ) {
    return (
      <RankingResults
        key={sequence}
        app={app}
        operation={output.operation}
        data={output.data}
        input={input}
      />
    );
  }
  if (output.operation === "prepare_group_creation") {
    return <GroupCreation key={sequence} app={app} data={output.data} />;
  }
  if (output.operation === "create_group") {
    const saved = groupResult.safeParse(output.data).data;
    if (saved) return <GroupCreated app={app} group={saved} />;
  }
  if (supportsPeopleResult(output.operation)) {
    return (
      <PeopleResults
        key={sequence}
        app={app}
        operation={output.operation}
        data={output.data}
        input={input}
      />
    );
  }
  if (supportsCatalogResult(output.operation)) {
    return (
      <CatalogResults
        key={sequence}
        app={app}
        operation={output.operation}
        data={output.data}
        input={input}
      />
    );
  }
  if (
    ["search_locations", "list_favorite_locations", "save_favorite_location"].includes(
      output.operation,
    ) &&
    !Array.isArray(record(output.data)?.keys)
  ) {
    return (
      <LocationResults
        key={sequence}
        app={app}
        operation={output.operation}
        data={output.data}
        input={input}
      />
    );
  }
  if (output.operation === "create_invite") {
    const link = record(output.data)?.link;
    if (typeof link === "string") return <InviteCardView key={sequence} link={link} />;
  }
  return <OperationResult key={sequence} data={output.data} operation={output.operation} />;
}
