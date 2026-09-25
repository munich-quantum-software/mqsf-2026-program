// An isolated local D1 database: no account or production data is used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import worker from "./worker.mjs";

const platform = await getPlatformProxy({ configPath: "cloudflare/wrangler.jsonc", persist: false, remoteBindings: false });
const { env } = platform;
const origin = "https://munich-quantum-software.github.io";
async function request(method = "GET", path = "/api/events", data, from = origin) {
  const response = await worker.fetch(new Request(`https://calendar.example${path}`, {
    method, headers: { Origin: from, ...(data !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  }), env);
  return { status: response.status, headers: response.headers, data: response.status === 204 ? null : await response.json() };
}
async function apply(file) {
  const sql = await readFile(new URL(file, import.meta.url), "utf8");
  // These migration files contain ordinary SQL statements without semicolons in string values.
  await env.DB.batch(sql.split(";").filter(sql => sql.trim()).map(sql => env.DB.prepare(sql)));
}
try {
  await apply("./migrations/0001_events.sql");
  assert.deepEqual((await request()).data, { events: [], demo: false });
  const draft = { date: "2026-10-14", start: "10:00", end: "11:15", title: "Meetup <b>plain text</b>",
    description: "Bring a laptop.\nAll welcome.", audience: "Developers", organizers: "Alex & Sam" };
  assert.equal((await request("POST", "/api/events", draft, "https://unrelated.example")).status, 403);
  const preflight = await request("OPTIONS");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  const created = await request("POST", "/api/events", draft);
  assert.equal(created.status, 201);
  const first = created.data.event, path = `/api/events/${first.id}`;
  assert.deepEqual(first, { ...draft, id: first.id, version: 1, updated_at: first.updated_at });
  assert.deepEqual((await request()).data.events, [first]);
  assert.equal((await request("POST", "/api/events", { ...draft, start: "10:30", end: "11:30" })).status, 201);
  const simultaneous = await Promise.all(["One", "Two"].map(title => request("PUT", path, { ...first, title })));
  assert.deepEqual(simultaneous.map(r => r.status).sort(), [200, 409]);
  const latest = simultaneous.find(r => r.status === 200).data.event;
  assert.equal(latest.version, 2);
  assert.equal((await request("DELETE", path, { version: 1 })).status, 409);
  for (const change of [{ organizers: " " }, { organizers: "x".repeat(201) }, { audience: null }, { date: "2026-10-16" },
    { start: "24:00" }, { start: "07:59" }, { start: "11:15" }, { end: "09:00" }]) {
    assert.equal((await request("POST", "/api/events", { ...draft, ...change })).status, 400);
  }
  assert.equal((await request("PUT", path, { ...latest, version: true })).status, 400);
  assert.equal((await request("POST", "/api/events", { ...draft, description: "x".repeat(20001) })).status, 413);
  assert.equal((await request("POST", "/api/events", { ...draft, start: "18:00", end: "21:00" })).status, 201);
  const edited = await request("PUT", path, { ...latest, organizers: "Taylor" });
  assert.equal(edited.data.event.organizers, "Taylor");
  assert.equal((await request("DELETE", path, { version: edited.data.event.version })).status, 200);
  assert.equal((await request("PUT", path, edited.data.event)).status, 404);
  assert.equal((await request("GET", "/worker.mjs")).status, 404);
  await apply("./migrations/0002_example_events.sql");
  const seeded = (await request()).data.events;
  const examples = seeded.filter(event => event.title.endsWith(" (example)"));
  assert.equal(examples.length, 5);
  const example = examples[0];
  await request("PUT", `/api/events/${example.id}`, { ...example, title: "Participant's updated title" });
  const beforeReseed = (await request()).data.events;
  await apply("./migrations/0002_example_events.sql");
  assert.deepEqual((await request()).data.events, beforeReseed, "Seed migration must preserve participants' edits");
  console.log("Cloudflare D1 checks passed: CRUD, validation, concurrent edits, CORS, hours, and example seeds.");
} finally { await platform.dispose(); }
