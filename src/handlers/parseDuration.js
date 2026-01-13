

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; 

function parseDurationToMs(input) {
  const s = String(input || "").trim().toLowerCase();
  if (!s) {
    return { ok: false, error: "Duration is required. Examples: 10m, 2h, 3d, 1h30m" };
  }

  
  const re = /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)/g;

  let total = 0;
  let found = false;
  let match;

  while ((match = re.exec(s)) !== null) {
    found = true;
    const n = Number(match[1]);
    const unit = match[2];

    if (!Number.isFinite(n) || n <= 0) continue;

    if (unit.startsWith("s")) total += n * 1000;
    else if (unit.startsWith("m")) total += n * 60 * 1000;
    else if (unit.startsWith("h")) total += n * 60 * 60 * 1000;
    else if (unit.startsWith("d")) total += n * 24 * 60 * 60 * 1000;
    else if (unit.startsWith("w")) total += n * 7 * 24 * 60 * 60 * 1000;
  }

  if (!found) {
    return { ok: false, error: "Invalid duration. Examples: 10m, 2h, 3d, 1h30m" };
  }

  if (total <= 0) return { ok: false, error: "Duration must be greater than 0." };
  if (total > MAX_TIMEOUT_MS) return { ok: false, error: "Timeout can’t exceed 28 days." };

  return { ok: true, ms: total };
}

module.exports = { parseDurationToMs, MAX_TIMEOUT_MS };
