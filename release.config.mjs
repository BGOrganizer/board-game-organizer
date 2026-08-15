/**
 * semantic-release configuration.
 *
 * Single unified semver version for the whole product (api + web + mobile):
 * - commit conventional → bump: breaking → major, feat → minor, fix → patch
 * - generates CHANGELOG.md, syncs apps/{api,web,mobile}/package.json and
 *   apps/mobile/app.config.js (expo.version, used by the APK build)
 * - commits the bump and creates the GitHub release v<version> with the notes
 *
 * Runs on main only (see main-ci.yml). The [skip ci] suffix on the release
 * commit prevents the workflow from re-triggering on its own bump.
 */
export default {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
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
    "@semantic-release/github",
  ],
};
