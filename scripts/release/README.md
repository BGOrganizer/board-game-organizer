# Release helpers

These Node.js scripts support release automation and PR draft publication. Run them from the
repository root using the project's Node.js version. They do not all perform a release:
version synchronization writes local files, PR notes print Markdown, and Telegram delivery
sends an external message.

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

It reads commit subjects from Git's three-dot range, groups Conventional Commit types and prints
Markdown with Italian headings to stdout. Unknown subjects fall under maintenance. Output is
read-only unless you redirect it to a file. Refs are passed directly as Git arguments, without shell interpolation. The [PR draft publisher](../../.github/scripts/publish-pr-draft.mjs)
provides the CI caller.

## Send a Telegram notification

[telegram-notify.mjs](telegram-notify.mjs) requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
in the process environment. Supply credentials through the existing secret injection; do not
put their values in tracked files or command examples.

With those variables already configured and the input files prepared:

```sh
node scripts/release/telegram-notify.mjs --title "Board Game Organizer v1.2.3" --changelog release-notes.md --links-file release-links.html --max-length 3500
```

This command immediately sends a message; there is no dry-run mode. `--title` supplies the first
line; `--changelog` is an optional Markdown file, `--links-file` an optional trusted HTML block,
and `--max-length` defaults to 3500. Links are placed before the notes; long messages are truncated
at line boundaries. Telegram API rejection causes a nonzero exit. Keep titles and link blocks
short enough to fit the service limit; do not assume arbitrary oversized inputs are validated.

CI invokes this helper through the [Telegram composite action](../../.github/actions/telegram-notify/action.yml).
See [operational gates](../../docs/organizations-events-operations.md) for publication and environment scope.
