const { getGuildConfig } = require("../storage/guildConfig");

async function sendToGuildLog(client, guildId, payload) {
  const cfg = getGuildConfig(guildId);
  const channelId = cfg.logChannelId;
  if (!channelId) return;

  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));

  if (!channel || !channel.isTextBased?.()) return;

  // Force-disable all pings from log messages
  const safePayload =
    typeof payload === "string"
      ? { content: payload, allowedMentions: { parse: [] } }
      : { ...payload, allowedMentions: { parse: [] } };

  try {
    await channel.send(safePayload);
  } catch (err) {
    console.error("❌ Failed to send log message:", err);
  }
}

module.exports = { sendToGuildLog };
