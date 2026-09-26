// An isolated local D1 database: no account or production data is used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import worker from "./worker.mjs";
import { notifyChanges } from "./notifications.mjs";
import { restoreSQL } from "./moderate.mjs";

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
  await env.DB.batch(unstable_splitSqlQuery(sql).map(sql => env.DB.prepare(sql)));
}
try {
  await apply("./migrations/0001_events.sql");
  await apply("./migrations/0003_private_contacts_and_history.sql");
  assert.deepEqual((await request()).data, { events: [], demo: false });
  const draft = { date: "2026-10-14", start: "10:00", end: "11:15", title: "Meetup <b>plain text</b>",
    description: "Bring a laptop.\nAll welcome.", audience: "Developers", organizers: "Alex & Sam", contact_email: "private@example.test" };
  assert.equal((await request("POST", "/api/events", draft, "https://unrelated.example")).status, 403);
  const preflight = await request("OPTIONS");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  const created = await request("POST", "/api/events", draft);
  assert.equal(created.status, 201);
  const first = created.data.event, path = `/api/events/${first.id}`;
  const { contact_email, ...publicDraft } = draft;
  assert.deepEqual(first, { ...publicDraft, id: first.id, version: 1, updated_at: first.updated_at });
  assert.deepEqual((await request()).data.events, [first]);
  assert.equal((await request("POST", "/api/events", { ...draft, start: "10:30", end: "11:30" })).status, 201);
  const simultaneous = await Promise.all(["One", "Two"].map(title => request("PUT", path, { ...first, title })));
  assert.deepEqual(simultaneous.map(r => r.status).sort(), [200, 409]);
  const latest = simultaneous.find(r => r.status === 200).data.event;
  assert.equal(latest.version, 2);
  assert.equal((await request("DELETE", path, { version: 1 })).status, 409);
  for (const change of [{ contact_email: "" }, { contact_email: null }, { contact_email: "not-an-email" }, { contact_email: "a@example.test\r\nBcc:x" }, { organizers: " " }, { organizers: "x".repeat(201) }, { audience: null }, { date: "2026-10-16" },
    { start: "24:00" }, { start: "07:59" }, { start: "11:15" }, { end: "09:00" }]) {
    assert.equal((await request("POST", "/api/events", { ...draft, ...change })).status, 400);
  }
  assert.equal((await request("PUT", path, { ...latest, version: true })).status, 400);
  assert.equal((await request("POST", "/api/events", { ...draft, description: "x".repeat(20001) })).status, 413);
  assert.equal((await request("POST", "/api/events", { ...draft, start: "18:00", end: "21:00" })).status, 201);
  const edited = await request("PUT", path, { ...latest, organizers: "Taylor" });
  assert.equal(edited.data.event.organizers, "Taylor");
  assert.equal((await env.DB.prepare("SELECT contact_email FROM events WHERE id=?").bind(first.id).first()).contact_email, contact_email, "Blank edits preserve the hidden address");
  const replaced = await request("PUT", path, { ...edited.data.event, contact_email: "replacement@example.test" });
  assert.equal(replaced.status, 200);
  assert.equal(JSON.stringify(replaced.data).includes("contact_email"), false);
  assert.equal((await request("DELETE", path, { version: replaced.data.event.version })).status, 200);
  const history = (await env.DB.prepare("SELECT * FROM event_changes WHERE event_id=? ORDER BY rowid").bind(first.id).all()).results;
  assert.deepEqual(history.map(row => row.action), ["created", "updated", "updated", "updated", "deleted"], "Conflicts must not create history");
  assert.equal(JSON.parse(history.at(-2).before_json).contact_email, contact_email);
  assert.equal(JSON.parse(history.at(-1).before_json).contact_email, "replacement@example.test");
  assert.equal(history.at(-1).after_json, null);
  for (const privatePath of ["/api/history", "/api/event_changes", "/api/events/" + first.id]) {
    assert.ok([404, 405].includes((await request("GET", privatePath)).status));
  }
  assert.equal(JSON.stringify((await request()).data).includes("contact_email"), false);
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
  const deletion = history.at(-1);
  const restored = await env.DB.prepare(restoreSQL(deletion.id, "before", 0)).first();
  assert.equal(restored.id, first.id);
  assert.equal(restored.version, replaced.data.event.version + 1, "Restoration must invalidate all old versions");
  assert.equal((await env.DB.prepare("SELECT contact_email FROM events WHERE id=?").bind(first.id).first()).contact_email, "replacement@example.test");
  assert.equal(await env.DB.prepare(restoreSQL(deletion.id, "before", 0)).first(), null, "Do not overwrite an event recreated since review");
  assert.equal(await env.DB.prepare(restoreSQL(deletion.id, "before", restored.version - 1)).first(), null);
  const reverted = await env.DB.prepare(restoreSQL(history[0].id, "after", restored.version)).first();
  assert.equal(reverted.version, restored.version + 1);
  assert.equal((await env.DB.prepare("SELECT title FROM events WHERE id=?").bind(first.id).first()).title, draft.title);
  assert.equal((await request("PUT", path, replaced.data.event)).status, 409, "Pre-deletion clients cannot overwrite a restored event");

  // A failed journal write must roll back the public mutation as well.
  const beforeFailure = (await request()).data.events;
  await env.DB.prepare("CREATE TRIGGER reject_history BEFORE INSERT ON event_changes BEGIN SELECT RAISE(ABORT, 'test failure'); END").run();
  assert.equal((await request("POST", "/api/events", draft)).status, 503);
  assert.deepEqual((await request()).data.events, beforeFailure);
  await env.DB.prepare("DROP TRIGGER reject_history").run();

  const realFetch = globalThis.fetch, deliveries = [];
  const notifyEnv = { ...env, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/123/test-only" };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).search, "?wait=true");
      assert.equal(options.redirect, "error");
      const payload = JSON.parse(options.body.get("payload_json"));
      assert.deepEqual(payload.allowed_mentions, { parse: [] });
      assert.ok(payload.content.length <= 2000);
      const snapshot = JSON.parse(await options.body.get("files[0]").text());
      deliveries.push(snapshot);
      return Response.json({ id: "discord-message" });
    };
    await notifyChanges(env); // No configured secret: leave the outbox untouched.
    assert.equal(deliveries.length, 0);
    await Promise.all([notifyChanges(notifyEnv), notifyChanges(notifyEnv)]);
    assert.equal(deliveries.length, 6);
    assert.equal(new Set(deliveries.map(d => d.change_id)).size, 6, "Concurrent drains must claim different changes");
    assert.equal(deliveries[0].after.contact_email, contact_email);
    let attempts = 0;
    globalThis.fetch = async () => { attempts++; return Response.json({ retry_after: 120, message: "Do not store response bodies" }, { status: 429 }); };
    await notifyChanges(notifyEnv);
    assert.equal(attempts, 1);
    const pending = await env.DB.prepare("SELECT * FROM event_changes WHERE notify_error IS NOT NULL").first();
    assert.equal(pending.notified_at, null);
    assert.equal(pending.notify_error, "Discord HTTP 429");
    assert.ok(pending.notify_after >= Math.floor(Date.now() / 1000) + 119);
    await env.DB.prepare("UPDATE event_changes SET notified_at='test' WHERE id!=?").bind(pending.id).run();
    await notifyChanges(notifyEnv);
    assert.equal(attempts, 1, "Respect retry backoff");
    await env.DB.prepare("UPDATE event_changes SET notify_after=0 WHERE id=?").bind(pending.id).run();
    globalThis.fetch = async () => { attempts++; return Response.json({ id: "retried-message" }); };
    await notifyChanges(notifyEnv);
    assert.equal(attempts, 2);
    assert.ok((await env.DB.prepare("SELECT notified_at FROM event_changes WHERE id=?").bind(pending.id).first()).notified_at);
    await assert.rejects(notifyChanges({ ...env, DISCORD_WEBHOOK_URL: "https://unrelated.example/webhook" }));
  } finally { globalThis.fetch = realFetch; }
  console.log("Cloudflare D1 checks passed: private contacts, atomic history, Discord outbox, retries, CRUD, validation, concurrent edits, CORS, hours, and example seeds.");
} finally { await platform.dispose(); }
