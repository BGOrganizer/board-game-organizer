/**
 * semantic-release configuration.
 *
 * Single unified semver version for the whole product (api + web + mobile):
 * - commit conventional → bump: breaking → major, feat → minor, fix → patch
 * - generates CHANGELOG.md, syncs apps/{api,web,mobile}/package.json and
 *   apps/mobile/app.config.js (expo.version, used by the APK build)
 * - commits the bump and (unless SKIP_PUBLISH=true) creates the GitHub release
 *
 * Runs on main only (see main-ci.yml). The [skip ci] suffix on the release
 * commit prevents the workflow from re-triggering on its own bump.
 *
 * Pipeline contract (main-ci.yml): main-ci runs semantic-release with
 * SKIP_PUBLISH=true → only the version bump + changelog are committed; the
 * GitHub release is created by the publish-release job ONLY after the APK
 * build, production deploys and E2E tests pass.
 *
 * Note: the changelog mirrors the PR-draft style (pr-ci's
 * scripts/release/pr-changelog.mjs groups by the same types with the same
 * emoji). The commit-analyzer parser accepts broader scope characters (`+`,
 * dots, hyphens) so scopes like `feat(release+mobile)` still trigger a
 * release.
 */

const TYPES = [
  { type: "feat", section: "✨ Nuove funzionalità", release: "minor" },
  { type: "fix", section: "🐛 Bug fix", release: "patch" },
  { type: "perf", section: "⚡ Performance", release: "patch" },
  { type: "refactor", section: "♻️ Refactoring", release: false },
  { type: "style", section: "🎨 Stile", release: false },
  { type: "docs", section: "📚 Documentazione", release: false },
  { type: "test", section: "🧪 Test", release: false },
  { type: "ci", section: "🔧 CI/CD", release: false },
  { type: "build", section: "📦 Build", release: false },
  { type: "chore", section: "🧹 Manutenzione", release: false },
  { type: "revert", section: "⏪ Revert", release: false },
];

// Default conventionalcommits parser rejects `+` (and some other chars) in
// scopes (e.g. feat(release+mobile):...) → the commit would not trigger a
// release. Broaden the header pattern (same fields order as the preset).
const PARSER = {
  parserOpts: {
    headerPattern: /^(\w*)(?:\(([\w-.+]+)\))?!?:\s*(.*)$/,
    headerCorrespondence: ["type", "scope", "subject"],
  },
};

const ANALYZER_CONFIG = {
  preset: "conventionalcommits",
  presetConfig: {
    types: TYPES.map(({ type, release }) => ({ type, release })),
  },
  parserOpts: PARSER.parserOpts,
};

const NOTES_CONFIG = {
  preset: "conventionalcommits",
  presetConfig: {
    types: TYPES.map(({ type, section }) => ({ type, section })),
  },
  parserOpts: PARSER.parserOpts,
};

export default {
  branches: ["main"],
  plugins: [
    ["@semantic-release/commit-analyzer", ANALYZER_CONFIG],
    ["@semantic-release/release-notes-generator", NOTES_CONFIG],
    "@semantic-release/changelog",
    [
      "@semantic-release/exec",
      {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release runtime placeholder
        prepareCmd: "node scripts/release/bump-versions.mjs ${nextRelease.version}",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "CHANGELOG.md",
          "apps/api/package.json",
          "apps/web/package.json",
          "apps/mobile/package.json",
          "apps/mobile/app.config.js",
        ],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release runtime placeholder
        message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
        author: "Hermes Bot <bot@bgo.dev>",
        committer: "Hermes Bot <bot@bgo.dev>",
      },
    ],
    // Publish step: skipped when SKIP_PUBLISH=true (the release is created by
    // main-ci's publish-release job only after builds/deploys/E2E pass).
    ...(process.env.SKIP_PUBLISH === "true"
      ? []
      : [
          [
            "@semantic-release/github",
            {
              // Skip posting "released in vX" comments on issues: the success
              // step tries to resolve every #N as a LOCAL issue/PR, which
              // fails when a commit references an EXTERNAL repo number.
              successCommentCondition: false,
            },
          ],
        ]),
  ],
};
