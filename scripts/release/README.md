# Release helpers

These Node.js scripts support release automation and PR draft publication. Run them from the
repository root using the project's Node.js version. They do not all perform a release:
version synchronization writes local files, PR notes print Markdown, and Telegram delivery
sends an external message.

Main's configured release notes and commit levels can be verified without publishing:

```sh
node --test .github/scripts/__tests__/semantic-release.test.mjs
```

This calls the installed generator/analyzer with fixtures, rather than running the release CLI.
For pinned preparation, retries and private staging, follow the
[Main delivery contract](../../docs/organizations-events-operations.md#main-delivery-and-manual-environment-selection).

## Synchronize product versions

[bump-versions.mjs](bump-versions.mjs) is used by semantic-release during preparation:

```sh
node scripts/release/bump-versions.mjs 1.2.3
```

It updates `version` in all three app `package.json` files and the Expo version in
`apps/mobile/app.config.js`. It accepts a semantic version, including prerelease/build suffixes.
It does not commit, tag, publish or build a native binary. Use it only for an intended version
change and inspect the four-file diff. Routine release execution belongs to the existing pipeline.

## Render PR notes

[pr-changelog.mjs](pr-changelog.mjs) needs Git history containing both refs:

```sh
node scripts/release/pr-changelog.mjs origin/main HEAD
```

It reads full commit messages and hashes from `base..head`, excluding commits present only on
the base branch. The installed semantic-release notes generator and the exported configuration
in [release.config.mjs](../../release.config.mjs) supply the same English categories, scope,
breaking-change notes and linked commit hashes as Production. Non-conventional subjects are
omitted consistently with Production. `GITHUB_REPOSITORY` can select another GitHub repository;
the default is `BGOrganizer/board-game-organizer`.

Output is read-only unless redirected. Refs are passed as Git arguments without shell interpolation.
The [PR publisher](../../.github/scripts/publish-pr-draft.mjs) provides the CI caller.

## Shared publication format

[release-format.mjs](release-format.mjs) renders English release titles, metadata, verified direct
APK downloads, Web/API links, checksums and changelog sections for both environments. Tags and
ownership/provenance checks retain their existing publication and recovery rules. New publications
use this format; existing published releases and historical `CHANGELOG.md` entries are not rewritten.

Development metadata identifies the actual verified APK merge source separately from the PR head
used by its publication guard. Production links only the merged PR whose merge SHA triggered the
workflow. A direct Main push without an associated merged PR does not acquire a fabricated PR link.

## Send a Telegram notification

[telegram-notify.mjs](telegram-notify.mjs) requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
in the process environment. Supply credentials through the existing secret injection; do not
put their values in tracked files or command examples.

CI supplies `GITHUB_REPOSITORY`, `APP_ENVIRONMENT`, `APP_VERSION`, the optional `PR_NUMBER`,
`RELEASE_URL`, `APK_URL` and `WEB_URL`, together with the bot/channel configuration. With the
metadata configured and a Conventional Commit changelog prepared:

```sh
node scripts/release/telegram-notify.mjs --changelog release-notes.md --max-length 3500
```

This command immediately sends one message. `--changelog` is required and `--max-length` defaults
to 3500. [telegram-format.mjs](telegram-format.mjs) is the pure renderer for previews and tests;
it does not send messages. Both environments use the same title, English groups and linked commits.
PR, direct APK, Web and full-release links precede the notes. API and optional EAS links remain in
the GitHub release only. Production reads the pinned release commit's notes rather than copying
the release body and its API metadata into Telegram.

Long changelogs share one bounded excerpt across categories and link to the full release. Whole
commit entries, links and HTML entities remain intact. Invalid metadata, oversized mandatory links
and Telegram API rejection fail the notification; provider responses and credentials are not logged.

CI invokes this helper through the [Telegram composite action](../../.github/actions/telegram-notify/action.yml).
See [operational gates](../../docs/organizations-events-operations.md) for publication and environment scope.
