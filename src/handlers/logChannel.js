const { getGuildConfig } = require("../storage/guildConfig");

async function sendToGuildLog(client, guildId, messageOptions) {
  const cfg = getGuildConfig(guildId);
  const channelId = cfg.logChannelId;
  if (!channelId) return;

  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));

  if (!channel || !channel.isTextBased?.()) return;

  const safe =
    typeof messageOptions === "string"
      ? { content: messageOptions, allowedMentions: { parse: [] } }
      : { ...messageOptions, allowedMentions: { parse: [] } };

  try {
    await channel.send(safe);
  } catch (err) {
    console.error("❌ Failed to send log message:", err);
  }
}

module.exports = { sendToGuildLog };
