# MQSF 2026 Program

Static event website for 14–15 October 2026.

Open `index.html` in a browser to preview the site locally.

## Side events

The [public calendar](https://munich-quantum-software.github.io/mqsf-2026-program/side-events/)
lets participants create and edit shared side events without an account.

The editable two-day calendar is in `side-events/`. Run `python3 backend/server.py --demo`
to review the main program at <http://127.0.0.1:8030/> and follow **Side events** to the calendar with labelled sample events.
See [the calendar guide](backend/README.md) for shared storage, configuration, and hosting instructions.
For the GitHub Pages deployment with shared editing, use [Cloudflare Workers and D1](cloudflare/README.md).
