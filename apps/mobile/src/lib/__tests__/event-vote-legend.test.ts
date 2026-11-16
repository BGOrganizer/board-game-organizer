import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

type Element = { type: unknown; props: { children?: unknown; [key: string]: unknown } };
const jsx = (type: unknown, props: Element["props"]) => ({ type, props });
const modules: Record<string, unknown> = {
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "react-native": { View: "View" },
  "heroui-native/text": { Typography: "Typography" },
  "heroui-native/hooks": { useThemeColor: () => ["success", "warning", "danger"] },
  "lucide-react-native": { Check: "Check", Minus: "Minus", X: "X" },
  "@/components/common/ui/HelpPopover": { HelpPopover: "HelpPopover" },
  "@/lib/i18n": { useT: () => (message: string) => message },
};
const output: { EventVoteLegend?: (props: { label: string; scope?: string }) => Element } = {};
runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../../components/events/EventVoteLegend.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText,
  { exports: output, require: (name: string) => modules[name] },
);
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (value && typeof value === "object" && "props" in value)
    return text((value as Element).props.children);
  return typeof value === "string" ? value : "";
}
it.each([undefined, "event", "table"])(
  "explains native %s eligibility with three vote meanings",
  (scope) => {
    const element = output.EventVoteLegend?.({ label: "Options", scope });
    expect(element?.props.label).toBe("Options: Voting legend");
    expect(element?.props.title).toBe("Options");
    const content = text(element);
    for (const label of ["Yes", "If needed", "No"]) expect(content).toContain(label);
    expect(content).toContain(
      scope === "table"
        ? "You can vote only if you are an accepted participant at this table."
        : "You can vote only if you are an accepted participant in at least one table in the event.",
    );
    expect(content).toContain('Choose at least one "Yes" or "If needed" option in this category.');
    expect(content).not.toContain("Field help");
  },
);
