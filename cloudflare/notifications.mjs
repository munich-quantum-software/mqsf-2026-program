// A private audit row is also the outbox entry, so failed delivery never loses a change.
export async function notifyChanges(env, limit = 3) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  let url;
  try { url = new URL(env.DISCORD_WEBHOOK_URL); } catch { /* Never include a malformed secret in an error. */ }
  if (!url || url.origin !== "https://discord.com" || url.username || url.password || !/^\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(url.pathname)) {
    throw new Error("Configure a Discord incoming webhook in DISCORD_WEBHOOK_URL.");
  }
  url.search = "?wait=true";
  const plain = value => String(value || "Not supplied").replace(/[`\r\n]/g, " ");
  for (let count = 0; count < limit; count++) {
    const now = Math.floor(Date.now() / 1000), lease = now + 120;
    const change = await env.DB.prepare(`UPDATE event_changes SET notify_lease_until=?, notify_attempts=notify_attempts+1
      WHERE id=(SELECT id FROM event_changes WHERE notified_at IS NULL AND notify_after<=? AND notify_lease_until<=?
        ORDER BY created_at, rowid LIMIT 1) RETURNING *`).bind(lease, now, now).first();
    if (!change) return;
    const before = JSON.parse(change.before_json), after = JSON.parse(change.after_json), event = after || before;
    const changed = before && after ? Object.keys(after).filter(key => !["version", "updated_at"].includes(key) && before[key] !== after[key]) : [];
    const content = `**MQSF meet-up ${change.action}**\n\`\`\`\n${plain(event.title)}\n${event.date} · ${event.start}–${event.end} (Munich time)\nOrganizer(s): ${plain(event.organizers)}\nPrivate contact: ${plain(event.contact_email)}\n\`\`\`\n`
      + (changed.length ? `Changed: ${changed.join(", ")}\n` : "")
      + `Change ID: \`${change.id}\`\nFull details before and after are attached. Private — for MQSF organizers only.`;
    const body = new FormData();
    body.set("payload_json", JSON.stringify({ content, username: "MQSF Community", allowed_mentions: { parse: [] }, flags: 4 }));
    body.set("files[0]", new Blob([JSON.stringify({ change_id: change.id, action: change.action, at: change.created_at, before, after }, null, 2)], { type: "application/json" }), `mqsf-change-${change.id}.json`);
    let error = "Network or confirmation error", retry = Math.min(3600, 60 * 2 ** Math.min(change.notify_attempts - 1, 6));
    try {
      const response = await fetch(url, { method: "POST", body, redirect: "error", signal: AbortSignal.timeout(8000) });
      if (response.ok && typeof (await response.json()).id === "string") {
        await env.DB.prepare(`UPDATE event_changes SET notified_at=?, notify_lease_until=0, notify_error=NULL
          WHERE id=? AND notify_lease_until=?`).bind(new Date().toISOString(), change.id, lease).run();
        continue;
      }
      error = `Discord HTTP ${response.status}`;
      if (response.status === 429) {
        const seconds = Number((await response.json()).retry_after);
        if (Number.isFinite(seconds)) retry = Math.max(retry, Math.ceil(seconds));
      }
    } catch { /* Do not log response bodies, contact details, or webhook URLs. */ }
    await env.DB.prepare(`UPDATE event_changes SET notify_after=?, notify_lease_until=0, notify_error=?
      WHERE id=? AND notify_lease_until=?`).bind(Math.floor(Date.now() / 1000) + retry, error, change.id, lease).run();
    return; // Back off for the channel, including rate limits and revoked webhooks.
  }
}
