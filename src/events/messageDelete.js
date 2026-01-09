const { Events, EmbedBuilder } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");
const { clip } = require("../handlers/text");

module.exports = {
  name: Events.MessageDelete,
  async execute(client, message) {
    try {
      // Use IDs directly (more reliable than message.guild on deletes)
      const guildId = message.guildId;
      const channelId = message.channelId;

      if (!guildId || !channelId) return;

      // Try to fetch full message (often fails on delete — that's normal)
      if (message.partial) {
        try {
          message = await message.fetch();
        } catch {}
      }

      // Ignore bot messages if we can detect them
      if (message.author?.bot) return;

      const authorTag = message.author?.tag ?? "Unknown author";
      const authorId = message.author?.id ?? "unknown";
      const content = (message.content ?? "").trim();

      const embed = new EmbedBuilder()
        .setTitle("Message Deleted")
        .setDescription(
          `**User:** ${authorTag}\n` +
          `**User ID:** ${authorId}\n` +
          `**Channel:** <#${channelId}>`
        )
        .addFields({
          name: "Content",
          value: clip(content || "*no text content (uncached or partial delete)*"),
          inline: false,
        })
        .setTimestamp(new Date());

      // Avatar if available
      const avatar = message.author?.displayAvatarURL?.({ size: 128 });
      if (avatar) embed.setThumbnail(avatar);

      await sendToGuildLog(client, guildId, { embeds: [embed] });
    } catch (err) {
      console.error("❌ messageDelete embed log error:", err);
    }
  },
};
