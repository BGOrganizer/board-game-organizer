export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "restarting"
  | "download-error"
  | "restart-error";

/** One coordinator per JS session: postponement survives navigation and foregrounding. */
export function createUpdateController(ports: {
  check: () => Promise<boolean>;
  download: () => Promise<boolean>;
  reload: () => Promise<void>;
  canRestart: () => boolean;
  change: (phase: UpdatePhase) => void;
  report: (error: unknown) => void;
}) {
  let phase: UpdatePhase = "idle";
  let disposed = false;
  let deferred = false;
  let checked = false;
  let downloaded = false;
  const setPhase = (next: UpdatePhase) => {
    phase = next;
    ports.change(next);
  };
  return {
    async check() {
      if (disposed || deferred || checked || phase !== "idle" || !ports.canRestart()) return;
      checked = true;
      setPhase("checking");
      try {
        const available = await ports.check();
        if (!disposed) setPhase(available ? "available" : "idle");
      } catch (error) {
        if (!disposed) {
          ports.report(error);
          setPhase("idle");
        }
      }
    },
    background() {
      checked = false;
    },
    defer() {
      if (disposed || phase === "downloading" || phase === "restarting") return;
      deferred = true;
      setPhase("idle");
    },
    async accept() {
      if (
        disposed ||
        deferred ||
        !["available", "ready", "download-error", "restart-error"].includes(phase) ||
        !ports.canRestart()
      )
        return;
      if (!downloaded) {
        setPhase("downloading");
        try {
          downloaded = await ports.download();
          if (disposed) return;
          if (!downloaded) {
            setPhase("download-error");
            return;
          }
        } catch (error) {
          if (!disposed) {
            ports.report(error);
            setPhase("download-error");
          }
          return;
        }
      }
      if (!ports.canRestart()) {
        setPhase("ready");
        return;
      }
      setPhase("restarting");
      try {
        await ports.reload();
      } catch (error) {
        if (!disposed) {
          ports.report(error);
          setPhase("restart-error");
        }
      }
    },
    dispose() {
      disposed = true;
    },
  };
}

type NavigationState = {
  index?: number;
  routes: readonly { name: string; state?: NavigationState }[];
};

/** Editors can remain mounted behind another route, so inspect the entire root stack. */
export function isRestartSafeNavigation(state: NavigationState | undefined): boolean {
  if (!state || state.routes.length === 0) return false;
  return state.routes.every((route) => {
    if (route.name === "index") return true;
    if (route.name !== "(tabs)" || !route.state) return false;
    const tab = route.state.routes[route.state.index ?? 0];
    return Boolean(
      tab && ["tables", "events", "groups", "contacts"].includes(tab.name) && !tab.state,
    );
  });
}
