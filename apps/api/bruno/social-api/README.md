# Board Game Organizer Social API — Bruno

## Open the native Bruno collection (recommended)

In Bruno, choose **Open Collection** and select this directory:

```text
D:\git\board-game-organizer\apps\api\bruno\social-api
```

Select the **folder**, not `bruno.json`. That file is only the folder manifest, not an exported collection; importing it can produce `Unsupported collection format`.
Then select the `Local` environment. The native collection includes response assertions.

## Import a single file instead

Choose **Import Collection** and select `../board-game-organizer-social.postman_collection.json` (Postman Collection v2.1 format).
This alternative contains the same 20 requests and collection variables, but not the native Bruno test scripts.

After importing the collection, open its environment manager, choose **Import**, and select `../Local.postman_environment.json` (Postman environment format). Then select `Local` as the active environment. It contains the same six variables as `environments/Local.bru`; both JWT values are intentionally empty. Fill in user IDs and fresh JWTs locally, without committing them.

The CLI accepts the native request files. Authenticated local requests still require a running API and fresh JWTs; parsing a collection does not prove those requests pass.

## Local setup

1. Start MongoDB and API:

   ```bash
   docker compose up -d mongodb
   pnpm --filter api dev
   ```

2. Ensure two Clerk users exist and are mirrored in local MongoDB. Missing mirrors return `409 User profile not synchronized`.
3. In `Local`, set both Clerk IDs (`actorUserId`, `targetUserId`) and fresh session JWTs (`actorToken`, `targetToken`). From an authenticated browser session, a token can be copied with `await window.Clerk.session.getToken()` in DevTools.
4. Set `searchQuery` to at least four characters.
5. Run requests in sequence order. Actor sends requests; target accepts or rejects them.

Never commit real JWTs. Clerk session JWTs rotate, so replace expired values when requests return `401`.

All mutation endpoints validate path/query/body input and execute database work inside MongoDB transactions.
