# Local BoardGameGeek catalog

The `data/` directory holds the local BGG rankings dump and stays ignored by Git.
The scripts in this directory start MongoDB and import the catalog. Run the commands below from the repository root with Docker running.

## Prepare the dump

Download the authenticated BoardGameGeek `bg_ranks` CSV export, extract it and save the complete
file as `scripts/mongodb/data/boardgames_ranks.csv`. Keep its original header: the importer needs
IDs, names, publication years, ratings, general/category ranks and the expansion flag.
A reduced CSV containing only ID/name/year is insufficient.

## First start

```sh
docker compose up -d --wait --wait-timeout 600
bun run --filter api migrate
```

Compose starts MongoDB 7, initializes replica set `rs0`, imports the catalog and reports healthy
only after completion. The API template contains the local connection URI. Migrations prepare
application indexes; they are separate from catalog updates.

## Update the local catalog

1. Download a fresh complete rankings export and replace the CSV at the path above.
2. Recreate the MongoDB container so Docker binds the current file and startup reruns the import:

   ```sh
   docker compose up -d --force-recreate --wait --wait-timeout 600 mongodb
   ```

3. Inspect the import log:

   ```sh
   docker compose logs --tail 100 mongodb
   docker compose ps mongodb
   ```

Look for `BGG import complete` and a healthy container. For live progress, use
`docker compose logs -f mongodb` in another terminal. Recreating briefly interrupts local database
connections but preserves the named `mongodb-data` volume. Do not delete that volume to update
the catalog. Ordinary `docker compose up` does not rerun startup if the container is already running.

The [startup script](start-mongodb.sh) invokes [the importer](import-bgg.sh), which stages
and validates rows before [merging](import-bgg.js) into `boardGames` by BGG ID. Games absent
from the new CSV and XML-enriched metadata are retained. Parse/validation failures preserve the
existing catalog; fix the CSV and repeat the recreate command. The container stays unhealthy
until an import completes successfully.

## Use a different CSV path

Set `BGG_CSV_PATH` to an absolute file path before running the same Compose commands.
The file must already exist and be nonempty.

PowerShell:

```powershell
$env:BGG_CSV_PATH = 'D:/catalog/boardgames_ranks.csv'
docker compose up -d --force-recreate --wait --wait-timeout 600 mongodb
```

POSIX shell:

```sh
BGG_CSV_PATH=/absolute/path/boardgames_ranks.csv docker compose up -d --force-recreate --wait --wait-timeout 600 mongodb
```

The local importer updates CSV fields only; it does not fetch BGG XML metadata or eagerly enrich
the top 200 games. For the separate remote import CLI and its bounded metadata enrichment,
see [catalog development documentation](../../docs/development.md#boardgamegeek-catalog).

## Script responsibilities

| Script | Role |
| --- | --- |
| `start-mongodb.sh` | Container entrypoint: starts MongoDB, initializes the replica set, waits for primary election, imports the CSV and sets the health marker. |
| `import-bgg.sh` | Validates the CSV header, loads staging with `mongoimport`, then invokes the transformation. Requires `MONGODB_URI`, `BGG_CSV`, MongoDB tools and the container mount paths. |
| `import-bgg.js` | Runs in `mongosh`; validates transformed rows, creates catalog indexes and merges into `boardGames`. |

Use Compose for local operation; these scripts rely on its container environment and mounts.
