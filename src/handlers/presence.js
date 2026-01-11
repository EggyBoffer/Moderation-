const { ActivityType } = require("discord.js");
const { getBotMeta } = require("../storage/botMeta");

/**
 * Sets bot presence once, then refreshes occasionally.
 * Safe: low-frequency updates to avoid rate limits.
 */
function startPresenceTicker(client) {
  if (client._presenceTickerStarted) return;
  client._presenceTickerStarted = true;

  const meta = getBotMeta();

  const applyPresence = () => {
    const guildCount = client.guilds?.cache?.size ?? 0;

    client.user?.setPresence({
      status: "online",
      activities: [
        {
          name: `/help | ${guildCount} server${guildCount === 1 ? "" : "s"}`,
          type: ActivityType.Watching,
        },
      ],
    });
  };

  // Set immediately
  applyPresence();

  // Refresh every 10 minutes (very safe)
  setInterval(() => {
    applyPresence();
  }, 600_000);
}

module.exports = { startPresenceTicker };
