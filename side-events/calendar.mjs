export function minutes(time) {
  const [hours, minute] = time.split(":").map(Number);
  return hours * 60 + minute;
}

export function clock(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

// Interval partitioning: overlapping events get separate lanes; touching events do not overlap.
export function layoutEvents(events) {
  const sorted = events.map(event => ({ ...event, from: minutes(event.start), to: minutes(event.end) }))
    .sort((a, b) => a.from - b.from || b.to - a.to || a.id.localeCompare(b.id));
  const result = [];
  let group = [], ends = [], groupEnd = -1;
  function finishGroup() {
    result.push(...group.map(event => ({ ...event, columns: ends.length })));
    group = []; ends = []; groupEnd = -1;
  }
  for (const event of sorted) {
    if (event.from >= groupEnd) finishGroup();
    let column = ends.findIndex(end => end <= event.from);
    if (column < 0) column = ends.length;
    ends[column] = event.to;
    group.push({ ...event, column });
    groupEnd = Math.max(groupEnd, event.to);
  }
  finishGroup();
  return result;
}
