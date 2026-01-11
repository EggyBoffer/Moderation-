const { ActivityType } = require("discord.js");

const ROTATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (safe)

/* ---------- helpers ---------- */

function parseActivityType(type) {
  const t = String(type || "").trim().toLowerCase();
  if (t === "playing") return ActivityType.Playing;
  if (t === "watching") return ActivityType.Watching;
  if (t === "listening") return ActivityType.Listening;
  if (t === "competing") return ActivityType.Competing;
  return ActivityType.Watching;
}

function getPresenceMessages(client) {
  const guildCount = client.guilds?.cache?.size ?? 0;

  // Rotation list
  const rawRotate = process.env.PRESENCE_ROTATE;
  if (rawRotate) {
    return rawRotate
      .split(";")
      .map((s) =>
        s
          .trim()
          .replaceAll("{servers}", String(guildCount))
      )
      .filter(Boolean);
  }

  // Fallback to single text
  const single = process.env.PRESENCE_TEXT || "/help";
  return [single.replaceAll("{servers}", String(guildCount))];
}

/* ---------- main ---------- */

function startPresenceTicker(client) {
  if (client._presenceTickerStarted) return;
  client._presenceTickerStarted = true;

  const activityType = parseActivityType(process.env.PRESENCE_TYPE);
  const status = (process.env.PRESENCE_STATUS || "online").toLowerCase();

  let index = 0;

  const applyPresence = () => {
    const messages = getPresenceMessages(client);
    if (!messages.length) return;

    const name = messages[index % messages.length];
    index++;

    client.user?.setPresence({
      status,
      activities: [{ name, type: activityType }],
    });
  };

  // Set immediately
  applyPresence();

  // Rotate safely
  setInterval(applyPresence, ROTATE_INTERVAL_MS);
}

module.exports = { startPresenceTicker };
