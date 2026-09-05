# Local BoardGameGeek dump

Download the authenticated BoardGameGeek `bg_ranks` CSV dump, extract it, and save it as:

```text
data/boardgame_ranks.csv
```

The file must contain `id`, `name`, and `yearpublished` columns. CSV and ZIP files in this directory
are ignored by Git.

Override the location without copying the file:

```bash
BGG_CSV_PATH=/absolute/path/boardgame_ranks.csv docker compose up -d
```

Every MongoDB container start imports into a staging collection, validates the result, adds indexes,
then replaces `boardGames`. Existing catalog data is preserved if parsing or transformation fails.
MongoDB becomes healthy only after replica-set initialization and import complete.

Check progress:

```bash
docker compose logs -f mongodb
```
