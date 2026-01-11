const { ActivityType } = require("discord.js");

function parseActivityType(type) {
  const t = String(type || "").trim().toLowerCase();
  if (t === "playing") return ActivityType.Playing;
  if (t === "watching") return ActivityType.Watching;
  if (t === "listening") return ActivityType.Listening;
  if (t === "competing") return ActivityType.Competing;
  return ActivityType.Watching;
}

function buildPresenceText(client) {
  // Supports {servers} token in env text
  const guildCount = client.guilds?.cache?.size ?? 0;

  const raw = process.env.PRESENCE_TEXT || "/help";
  return String(raw).replaceAll("{servers}", String(guildCount));
}

/**
 * Sets bot presence once, then refreshes occasionally.
 * Safe: low-frequency updates to avoid rate limits.
 */
function startPresenceTicker(client) {
  if (client._presenceTickerStarted) return;
  client._presenceTickerStarted = true;

  const activityType = parseActivityType(process.env.PRESENCE_TYPE);
  const status = (process.env.PRESENCE_STATUS || "online").toLowerCase(); // online, idle, dnd, invisible

  const applyPresence = () => {
    const text = buildPresenceText(client);

    client.user?.setPresence({
      status,
      activities: [{ name: text, type: activityType }],
    });
  };

  // Set immediately
  applyPresence();

  // Refresh every 10 minutes (safe) in case {servers} changes
  setInterval(() => applyPresence(), 600_000);
}

module.exports = { startPresenceTicker };
