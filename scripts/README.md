# Repository scripts

Run commands from the repository root. Use the Node.js version and locked bun run dependencies
specified in the [project setup](../README.md#get-started).

| Functionality | Guide | Purpose |
| --- | --- | --- |
| MongoDB and BGG catalog | [mongodb](mongodb/README.md) | Start the local replica set and update the catalog from the ignored CSV dump. |
| Branding exports | [branding](branding/README.md) | Regenerate or verify web and native assets from the approved mascot. |
| Dependency installation | [dependencies](dependencies/README.md) | Keep registry sources, lifecycle permissions and Node runtime consistent under Bun. |
| Release helpers | [release](release/README.md) | Synchronize versions, render PR notes and send release notifications. |

The guides identify which commands write files, update a database or send a message.
