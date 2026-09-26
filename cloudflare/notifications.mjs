const labels = { title: "Title", date: "Day", start: "Start time", end: "End time", organizers: "Organizer(s)", contact_email: "Contact email (private)", description: "Description", audience: "Intended audience" };
function display(value, limit = 900) {
  const text = String(value || "Not supplied").replace(/[\\`*_~|\[\]()<>]/g, "\\$&");
  return text.length <= limit ? text : text.slice(0, limit - 25) + "… (full text attached)";
}

export function discordMessage(change) {
  const before = JSON.parse(change.before_json), after = JSON.parse(change.after_json), event = after || before;
  const appearance = { created: ["➕ Meet-up added", 0x238636], updated: ["✏️ Meet-up changed", 0x2563eb], deleted: ["🗑️ Meet-up deleted", 0xd1242f] };
  const [title, color] = appearance[change.action];
  const date = new Date(`${event.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
  const fields = [
    { name: "Organizer(s)", value: display(event.organizers), inline: true },
    { name: "Contact email (private)", value: display(event.contact_email), inline: true },
  ];
  if (before && after) {
    for (const [key, label] of Object.entries(labels)) {
      if (before[key] !== after[key]) fields.push({ name: `${label} changed`, value: `**Before**\n${display(before[key], 400)}\n\n**After**\n${display(after[key], 400)}` });
    }
    if (fields.length === 2) fields.push({ name: "No content changes", value: "The event was saved without changing its details." });
  } else {
    fields.push({ name: "Description", value: display(event.description) }, { name: "Intended audience", value: display(event.audience) });
  }
  return {
    username: "MQSF Community", allowed_mentions: { parse: [] },
    embeds: [{ title, color, description: `**${display(event.title)}**\n${date} · ${event.start}–${event.end} (Munich time)`, fields,
      footer: { text: `Private · Change ${change.id} · Full details attached` }, timestamp: change.created_at }],
  };
}

// A private audit row is also the outbox entry, so failed delivery never loses a change.
export async function notifyChanges(env, limit = 3) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  let url;
  try { url = new URL(env.DISCORD_WEBHOOK_URL); } catch { /* Never include a malformed secret in an error. */ }
  if (!url || url.origin !== "https://discord.com" || url.username || url.password || !/^\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(url.pathname)) {
    throw new Error("Configure a Discord incoming webhook in DISCORD_WEBHOOK_URL.");
  }
  url.search = "?wait=true";
  for (let count = 0; count < limit; count++) {
    const now = Math.floor(Date.now() / 1000), lease = now + 120;
    const change = await env.DB.prepare(`UPDATE event_changes SET notify_lease_until=?, notify_attempts=notify_attempts+1
      WHERE id=(SELECT id FROM event_changes WHERE notified_at IS NULL AND notify_after<=? AND notify_lease_until<=?
        ORDER BY created_at, rowid LIMIT 1) RETURNING *`).bind(lease, now, now).first();
    if (!change) return;
    const before = JSON.parse(change.before_json), after = JSON.parse(change.after_json);
    const body = new FormData();
    body.set("payload_json", JSON.stringify(discordMessage(change)));
    body.set("files[0]", new Blob([JSON.stringify({ change_id: change.id, action: change.action, at: change.created_at, before, after }, null, 2)], { type: "application/json" }), `mqsf-change-${change.id}.json`);
    let error = "Network error", stage = "request", retry = Math.min(3600, 60 * 2 ** Math.min(change.notify_attempts - 1, 6));
    try {
      // Workers support manual redirects; never forward private payloads to a redirected URL.
      const response = await fetch(url, { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(8000) });
      stage = `HTTP ${response.status} confirmation`;
      if (response.ok && typeof (await response.json()).id === "string") {
        stage = "record delivery";
        await env.DB.prepare(`UPDATE event_changes SET notified_at=?, notify_lease_until=0, notify_error=NULL
          WHERE id=? AND notify_lease_until=?`).bind(new Date().toISOString(), change.id, lease).run();
        continue;
      }
      error = `Discord HTTP ${response.status}`;
      if (response.status === 429) {
        const seconds = Number((await response.json()).retry_after);
        if (Number.isFinite(seconds)) retry = Math.max(retry, Math.ceil(seconds));
      }
    } catch (failure) {
      const kind = ["TypeError", "SyntaxError", "TimeoutError", "AbortError"].includes(failure.name) ? failure.name : "Error";
      error = `${stage}: ${kind}`; // Never include exception messages, bodies, contacts, or webhook URLs.
    }
    await env.DB.prepare(`UPDATE event_changes SET notify_after=?, notify_lease_until=0, notify_error=?
      WHERE id=? AND notify_lease_until=?`).bind(Math.floor(Date.now() / 1000) + retry, error, change.id, lease).run();
    return; // Back off for the channel, including rate limits and revoked webhooks.
  }
}
