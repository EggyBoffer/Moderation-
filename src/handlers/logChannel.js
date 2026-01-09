const { getGuildConfig } = require("../storage/guildConfig");

async function sendToGuildLog(client, guildId, payload) {
  const cfg = getGuildConfig(guildId);
  const channelId = cfg.logChannelId;
  if (!channelId) return; // no log channel set for this guild

  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));

  if (!channel || !channel.isTextBased?.()) return;

  try {
    await channel.send(payload);
  } catch (err) {
    console.error("❌ Failed to send log message:", err);
  }
}

module.exports = { sendToGuildLog };
