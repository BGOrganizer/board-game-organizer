import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from "react";
import { blockAppRestart } from "@/lib/appRestartGuard";
import type { InputScrollTarget } from "@/lib/inputScrollContext";

type Field = { target: () => InputScrollTarget | null; invalid: () => boolean; reveal: () => void };
type Interaction = {
  register: (field: Field) => () => void;
  requestFirstError: () => void;
  deferFirstError: () => { reveal: () => void; isCurrent: () => boolean };
  cancelErrorFocus: () => void;
};
const Context = createContext<Interaction | null>(null);
export const useFormInteraction = () => useContext(Context);

/** UI-only validation scope: no form values, server data or universal layout. */
export function FormInteractionScope({
  children,
  sourceRevision,
  blocksAppRestart = true,
}: {
  children: ReactNode;
  sourceRevision?: number;
  blocksAppRestart?: boolean;
}) {
  useEffect(() => (blocksAppRestart ? blockAppRestart() : undefined), [blocksAppRestart]);
  const fields = useRef(new Set<Field>());
  const generation = useRef(0);
  const revision = useRef(sourceRevision);
  // Expire callbacks before deferred measurements, without remounting the draft's fields.
  if (revision.current !== sourceRevision) {
    revision.current = sourceRevision;
    generation.current++;
  }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      fields.current.clear();
    };
  }, []);
  const value = useMemo<Interaction>(() => {
    const requestFirstError = () => {
      if (!mounted.current) return;
      const version = ++generation.current;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (version !== generation.current) return;
          const invalid = [...fields.current].filter((field) => field.invalid() && field.target());
          void Promise.all(
            invalid.map(
              (field) =>
                new Promise<{ field: Field; top: number } | null>((resolve) => {
                  const target = field.target();
                  if (!target) {
                    resolve(null);
                    return;
                  }
                  target.measureInWindow((_x, top, width, height) =>
                    resolve(width > 0 && height > 0 ? { field, top } : null),
                  );
                }),
            ),
          ).then((measured) => {
            if (version !== generation.current) return;
            measured
              .filter((row) => row !== null)
              .filter((row) => fields.current.has(row.field) && row.field.invalid())
              .sort((a, b) => a.top - b.top)[0]
              ?.field.reveal();
          });
        }),
      );
    };
    return {
      register: (field) => {
        fields.current.add(field);
        return () => {
          fields.current.delete(field);
        };
      },
      requestFirstError,
      cancelErrorFocus: () => {
        generation.current++;
      },
      deferFirstError: () => {
        const version = ++generation.current;
        const isCurrent = () => mounted.current && version === generation.current;
        return {
          isCurrent,
          reveal: () => {
            if (isCurrent()) requestFirstError();
          },
        };
      },
    };
  }, []);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
