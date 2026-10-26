import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { expect, it } from "vitest";

it("loads the plural polyfill in mobile bootstrap, not in individual cards", () => {
  const source = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
  expect(source.indexOf('import "intl-pluralrules"')).toBeLessThan(
    source.indexOf('from "@lingui/core"'),
  );
});

it("reproduces missing Hermes PluralRules and formats real EN/IT catalogs after the polyfill", () => {
  // Fresh process avoids Node's cached polyfill hiding a genuinely absent runtime constructor.
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { setupI18n } from '@lingui/core';
    import { messages as en } from '../../messages/en.js';
    import { messages as it } from '../../messages/it.js';
    const require = createRequire(import.meta.url);
    Object.defineProperty(Intl, 'PluralRules', { value: undefined, writable: true, configurable: true });
    const broken = setupI18n({ locale: 'en', messages: { en } });
    assert.throws(() => broken._({ id: 'event.table.moreGames', values: { remaining: 2 } }), /constructor/);
    require('intl-pluralrules');
    for (const [locale, messages, singular, plural] of [['en', en, '+1 game', '+2 games'], ['it', it, '+1 gioco', '+2 giochi']]) {
      const i18n = setupI18n({ locale, messages: { [locale]: messages } });
      assert.equal(i18n._({ id: 'event.table.moreGames', values: { remaining: 1 } }), singular);
      assert.equal(i18n._({ id: 'event.table.moreGames', values: { remaining: 2 } }), plural);
      assert.equal(new Intl.PluralRules(locale).select(0), 'other');
    }
    console.log('EN/IT plural regression passed');
  `,
    ],
    { cwd: fileURLToPath(new URL("../../..", import.meta.url)), encoding: "utf8" },
  );
  expect(result.trim()).toBe("EN/IT plural regression passed");
});
