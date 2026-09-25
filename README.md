# MQSF 2026 Program

Static event website for 14–15 October 2026.

Open `index.html` in a browser to preview the main program alone.

## Side events

The [public calendar](https://munich-quantum-software.github.io/mqsf-2026-program/side-events/)
lets participants create and edit shared side events without an account.
Drag across empty calendar space to prefill an event's time range, or use **Add an event**.

The editable two-day calendar is in `side-events/`. Run `python3 backend/server.py --demo`
to review the main program at <http://127.0.0.1:8030/> and follow **Side events** to the calendar with labelled sample events.
See [the local preview guide](backend/README.md) for development and program hours.
For production storage, deployment, and backups, see [Cloudflare Workers and D1](cloudflare/README.md).
