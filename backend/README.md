# MQSF shared side-event calendar

The public GitHub Pages calendar uses [Cloudflare Workers and D1](../cloudflare/README.md).
This Python service provides the local preview and an alternative for hosting on a Python server.

The calendar's static files are in `side-events/`. The small Python WSGI service stores events in SQLite.
No application accounts, cookies, analytics, contact details, or visitor logs are used.
Only event fields (including public organizer names), random event IDs, revision numbers, and update timestamps are stored.
Hosting providers and reverse proxies may keep their own access logs; configure those separately.

## Local review

From the repository root, with Python 3.10 or newer:

```sh
python3 backend/server.py --demo --port 8030
```

Open <http://127.0.0.1:8030/> for the main program and follow **Side events** to the calendar.
The calendar is also available at <http://127.0.0.1:8030/mqsf/>. The labelled sample events are kept in `.data/demo.sqlite3`.
Stop the server with Ctrl+C. Without `--demo`, the app uses a separate, initially empty `.data/events.sqlite3`.
The local development server binds only to this computer. Use a production WSGI server for public hosting.

```sh
python3 backend/check.py
node backend/check-calendar.mjs
```

The checks use a temporary database and do not modify the preview.

## Program hours

`side-events/conference.json` follows the [main program](https://munich-quantum-software.github.io/mqsf-2026-program/):
both days start with registration at 08:00, talks run 09:00–17:55, and networking starts at 18:00 with an open end.
The start is enforced by the form and server; the end remains `null` so evening events are allowed.
If the program changes, update the hours and explanatory note, then restart the backend.
`viewStart` and `viewEnd` are display defaults only; the calendar expands to include events outside that range.
All dates/times refer to Munich local time (Europe/Berlin, CEST on 14–15 October 2026).

## Alternative Python hosting

The public calendar is hosted with [Cloudflare Workers and D1](../cloudflare/README.md).
The following instructions are only needed to move the API to a Python server.

**GitHub Pages:** publish `side-events/` alongside the existing program. It has no build step and uses relative asset URLs.
Set `window.MQSF_API_BASE` in `side-events/config.js` to the public HTTPS API URL (ending in `/api`).
Run the Python service on a host with persistent disk storage and set
`MQSF_ALLOWED_ORIGINS=https://munich-quantum-software.github.io` on that service.
GitHub Pages serves only the frontend; it cannot run Python or persist shared submissions by itself.
Never put a GitHub token or other credential in the frontend.

**CDA `/mqsf/`:** reverse-proxy `/mqsf/` to the Python service. The service handles the prefix itself.
Change the calendar's **Main program** link to the hosted program URL when it is on a separate site.
Set `window.MQSF_API_BASE = ""` in `config.js` for the same-origin API; it is resolved relative to the calendar URL.
Keep the database outside the website/deployment directory so a site update cannot overwrite submissions.

For example, on a Python host, install Gunicorn in a virtual environment and run:

```sh
python3 -m venv .venv
.venv/bin/pip install gunicorn
MQSF_DB=/var/lib/mqsf/events.sqlite3 \
MQSF_ALLOWED_ORIGINS=https://www.cda.cit.tum.de,https://munich-quantum-software.github.io \
.venv/bin/gunicorn --chdir backend --bind 127.0.0.1:8030 --workers 1 --threads 4 'server:create_app()'
```

The service account needs write access to the database directory. Have the host's service manager supervise this command.
Use the existing HTTPS reverse proxy; do not expose the Python development server publicly.
For Nginx inside the existing HTTPS server block:

```nginx
location = /mqsf { return 308 /mqsf/; }
location /mqsf/ {
    proxy_pass http://127.0.0.1:8030;
    proxy_set_header Host $host;
    client_max_body_size 20k;
}
```

Before starting the production service, include the five example slots with:

```sh
MQSF_DB=/var/lib/mqsf/events.sqlite3 python3 backend/server.py --seed-examples
```

Use the same database path as the production service. This exits after initialization and only adds events
when the database is empty, so rerunning it cannot duplicate events or overwrite participants' changes.
Each title is marked `(example)` and uses `Example organizer`; participants can edit or replace these placeholders.

Everyone can create, edit, and delete any event by design. Revision checks prevent silently overwriting simultaneous edits.
Deleting an event requires confirmation. Back up the SQLite database regularly using SQLite's online backup API
(`sqlite3.Connection.backup`), rather than copying the database file while it is being written.

The logo and favicon are reused from the program website. Sample events are only inserted with `--demo`
or the explicit `--seed-examples` initialization above; they are never added during a normal service startup.
