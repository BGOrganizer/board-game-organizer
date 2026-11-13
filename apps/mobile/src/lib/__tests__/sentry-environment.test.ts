import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = ts.createSourceFile(
  "_layout.tsx",
  readFileSync(new URL("../../app/_layout.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let integrations = "";
let options = "";
function visit(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === "sentryIntegrations" &&
    node.initializer
  )
    integrations = node.initializer.getText(source);
  if (ts.isCallExpression(node) && node.expression.getText(source) === "Sentry.init")
    options = node.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
const javascript = ts.transpileModule(
  `const sentryIntegrations = ${integrations}; const options = ${options}; options;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

it.each([
  [false, { extra: { sentryEnvironment: "development" } }, "development"],
  [false, { extra: { sentryEnvironment: "production" } }, "production"],
  [true, { extra: { sentryEnvironment: "development" } }, "development"],
  [false, undefined, "development"],
  [false, {}, "development"],
  [false, { extra: {} }, "development"],
])(
  "keeps Sentry environment independent of release/debug mode (%s, %j)",
  (debug, config, expected) => {
    const Sentry = {
      mobileReplayIntegration: vi.fn(() => "replay"),
      feedbackIntegration: vi.fn(() => "feedback"),
    };
    const result = runInNewContext(javascript, {
      Sentry,
      Constants: { expoConfig: config },
      __DEV__: debug,
      sentryDsn: "mobile-dsn",
    });
    expect(result.environment).toBe(expected);
    expect(result.dsn).toBe("mobile-dsn");
    expect(result.integrations).toEqual(debug ? ["replay", "feedback"] : []);
    expect(result.sendDefaultPii).toBe(true);
    expect(result.enableLogs).toBe(true);
    expect(result.replaysSessionSampleRate).toBe(0.1);
    expect(result.replaysOnErrorSampleRate).toBe(1);
  },
);
