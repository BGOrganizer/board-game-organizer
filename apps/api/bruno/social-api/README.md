# Board Game Organizer Social API — Bruno

Open this directory as a Bruno collection, then select the `Local` environment.

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
