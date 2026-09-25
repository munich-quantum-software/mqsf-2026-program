# Cloudflare hosting

GitHub Pages serves the website. A Cloudflare Worker handles `/api/events` and saves events in D1.
The deployed API is <https://mqsf-2026-calendar.mqsf-2026-program.workers.dev/api/events>.
The `mqsf-2026-calendar` database is already provisioned in the EU; its binding is in `wrangler.jsonc`.
There are no participant accounts. Everyone can edit or delete events, and revision checks protect concurrent edits.
Organizer names are public event data. No contact fields, cookies, analytics, or application visitor logs are collected.
The hosting providers may keep their own infrastructure logs.

## Development

Use Node.js 22 or newer and run `npm ci` from the repository root.

```sh
npm test
npx wrangler d1 migrations apply DB --local --config cloudflare/wrangler.jsonc
npm run dev:api
```

Tests use an isolated, temporary D1 database. The existing Python preview remains available with
`python3 backend/server.py --demo --port 8030`; it uses its own local sample database.

## Deploy

1. Sign in with `npx wrangler login --use-keyring --scopes account:read user:read workers_scripts:write d1:write`.
2. For a new installation, create a database with `npx wrangler d1 create mqsf-2026-calendar --jurisdiction eu`.
   Put its ID in `cloudflare/wrangler.jsonc`. Do not recreate an existing database.
3. Apply the schema and five example events:

   ```sh
   npx wrangler d1 migrations apply DB --remote --config cloudflare/wrangler.jsonc
   npm run deploy:api
   ```

4. Set the published API URL in `side-events/config.js`. Local previews should continue using their local API.
5. Push the website to the repository's `main` branch to publish it with GitHub Pages.

Migrations run once. The example titles are marked `(example)`; they are editable placeholders.
Deployment does not reset the database or recreate deleted examples. Never put tokens or passwords in this repository.
The Workers/D1 free plan has daily limits, so check usage in the Cloudflare dashboard during the event.

For later backend updates, run the tests, apply any new migrations, then `npm run deploy:api`.
Conference dates and hours are bundled from `side-events/conference.json`, so changes to that file need a Worker redeploy.

## Backups

Export before maintenance or after the event (the export contains public organizer names):

```sh
npx wrangler d1 export DB --remote --config cloudflare/wrangler.jsonc --output .data/mqsf-backup.sql
```

Keep exports outside Git. Cloudflare also provides D1 Time Travel recovery.
