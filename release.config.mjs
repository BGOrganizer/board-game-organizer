/**
 * semantic-release configuration.
 *
 * Single unified semver version for the whole product (api + web + mobile):
 * - commit conventional → bump: breaking → major, feat → minor, fix → patch
 * - generates CHANGELOG.md, syncs apps/{api,web,mobile}/package.json and
 *   apps/mobile/app.config.js (expo.version, used by the APK build)
 * - commits the bump and creates the GitHub release v<version> with the notes
 *   (all conventional types grouped in emoji sections)
 *
 * Runs on main only (see main-ci.yml). The [skip ci] suffix on the release
 * commit prevents the workflow from re-triggering on its own bump.
 *
 * Note: the changelog must mirror the PR-draft changelog style (pr-ci's
 * scripts/release/pr-changelog.mjs groups by the same types with the same
 * emoji), so the stable release shows everything that was in the draft.
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

export default {
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: TYPES.map(({ type, release }) => ({ type, release })),
        },
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: TYPES.map(({ type, section }) => ({ type, section })),
        },
      },
    ],
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
    [
      "@semantic-release/github",
      {
        // Skip posting "released in vX" comments on issues: the success step
        // tries to resolve every #N in the release notes/commits as a local
        // issue/PR, which fails when a commit references an EXTERNAL repo
        // number (e.g. reanimated PR #8083).
        successCommentCondition: false,
      },
    ],
  ],
};