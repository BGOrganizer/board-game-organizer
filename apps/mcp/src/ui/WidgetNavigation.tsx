import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { HeaderBackButton } from "@/components/common/layout/HeaderBackButton";
import { callToolResult, openWeb, type ToolOutput } from "./protocol";
import { widgetTarget } from "./widgetRoutes";

type OpenTool = (
  operation: string,
  args: Record<string, unknown>,
  onOpened?: () => void,
  detailTab?: string,
) => Promise<boolean>;
const Navigation = createContext<OpenTool | undefined>(undefined);

export function useWidgetNavigation(app: App) {
  const openTool = useContext(Navigation);
  return {
    canOpenPath(path: string) {
      return Boolean(openTool && widgetTarget(path));
    },
    async openPath(path: string, onOpened?: () => void) {
      const target = widgetTarget(path);
      if (openTool && target)
        return openTool(target.operation, target.args, onOpened, target.detailTab);
      const opened = await openWeb(app, path);
      if (opened) onOpened?.();
      return opened;
    },
    openTool,
  };
}

type Frame = { key: number; output: ToolOutput; input: unknown; detailTab?: string };
type Destination = Parameters<OpenTool>;
const detailedOperations = new Set(["get_event", "get_group", "get_table"]);

export function WidgetNavigation({
  app,
  output,
  input,
  render,
  onViewerChange,
}: {
  app: App;
  output: ToolOutput;
  input: unknown;
  render: (output: ToolOutput, input: unknown, detailTab?: string) => ReactNode;
  onViewerChange?: (viewerUserId: string) => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [frames, setFrames] = useState<Frame[]>([{ key: 0, output, input }]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<Destination>();
  const request = useRef<AbortController>(undefined);
  const nextKey = useRef(1);
  const current = frames[frames.length - 1];
  const triggers = useRef(new Map<number, HTMLElement>());
  const backButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const openedFullscreen = useRef(false);

  useEffect(
    () => () => {
      const controller = request.current;
      request.current = undefined;
      controller?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!restoreFocus.current) {
      if (pending || failed || current.key) backButton.current?.focus({ preventScroll: true });
      return;
    }
    restoreFocus.current = false;
    const trigger = triggers.current.get(current.key);
    triggers.current.delete(current.key);
    trigger?.focus({ preventScroll: true });
  }, [current.key, pending, failed]);

  const openTool: OpenTool = async (operation, args, onOpened, detailTab) => {
    if (request.current) return false;
    const controller = new AbortController();
    request.current = controller;
    const trigger = document.activeElement;
    if (
      !failed &&
      trigger instanceof HTMLElement &&
      trigger !== document.body &&
      trigger !== backButton.current
    ) {
      triggers.current.set(current.key, trigger);
    }
    setPending(true);
    setFailed(undefined);
    const display = detailedOperations.has(operation) ? app.getHostContext() : undefined;
    if (
      !openedFullscreen.current &&
      display?.displayMode === "inline" &&
      display.availableDisplayModes?.includes("fullscreen")
    ) {
      openedFullscreen.current = true;
      void app.requestDisplayMode({ mode: "fullscreen" }).catch(() => undefined);
    }
    let opened = false;
    try {
      const result = await callToolResult(app, operation, args, controller.signal);
      if (request.current !== controller) return false;
      const viewer = current.output.viewerUserId;
      const accountChanged = Boolean(
        viewer && result.viewerUserId && viewer !== result.viewerUserId,
      );
      if (accountChanged) {
        triggers.current.clear();
        queryClient.clear();
        openedFullscreen.current = false;
      }
      if (result.viewerUserId) onViewerChange?.(result.viewerUserId);
      const frame = {
        key: nextKey.current++,
        output: { ...result, viewerUserId: result.viewerUserId ?? viewer },
        input: args,
        detailTab,
      };
      setFrames(accountChanged ? [frame] : [...frames, frame]);
      opened = !accountChanged;
    } catch {
      if (request.current === controller) setFailed([operation, args, onOpened]);
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setPending(false);
      }
    }
    if (opened) onOpened?.();
    return opened;
  };

  function back() {
    restoreFocus.current = true;
    if (
      openedFullscreen.current &&
      ((frames.length === 2 && !pending && !failed) || (frames.length === 1 && (pending || failed)))
    ) {
      openedFullscreen.current = false;
      void app.requestDisplayMode({ mode: "inline" }).catch(() => undefined);
    }
    if (pending || failed) {
      request.current?.abort();
      request.current = undefined;
      setPending(false);
      setFailed(undefined);
      return;
    }
    setFrames(frames.slice(0, -1));
  }

  const canGoBack = frames.length > 1 || pending || failed;
  return (
    <Navigation.Provider value={openTool}>
      <div className="space-y-3">
        {canGoBack ? <HeaderBackButton ref={backButton} onPress={back} /> : null}
        {pending ? <Skeleton aria-label={t`Loading…`} className="h-20 w-full rounded-xl" /> : null}
        {failed ? (
          <div className="space-y-2">
            <p role="alert" className="text-danger">{t`Something went wrong`}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onPress={() => void openTool(...failed)}
            >
              {t`Try again`}
            </Button>
          </div>
        ) : null}
        {frames.map((frame) => (
          <Activity
            key={frame.key}
            mode={frame === current && !pending && !failed ? "visible" : "hidden"}
          >
            {render(frame.output, frame.input, frame.detailTab)}
          </Activity>
        ))}
      </div>
    </Navigation.Provider>
  );
}
