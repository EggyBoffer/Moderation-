const { Events, EmbedBuilder } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");
const { clip } = require("../handlers/text");

module.exports = {
  name: Events.MessageUpdate,
  async execute(client, oldMessage, newMessage) {
    try {
      const guildId = newMessage.guildId;
      const channelId = newMessage.channelId;
      if (!guildId || !channelId) return;

      if (oldMessage.partial) {
        try { oldMessage = await oldMessage.fetch(); } catch {}
      }
      if (newMessage.partial) {
        try { newMessage = await newMessage.fetch(); } catch {}
      }

      if (newMessage.author?.bot) return;

      const before = (oldMessage.content ?? "").trim();
      const after = (newMessage.content ?? "").trim();
      if (before === after) return;

      const author = newMessage.author;

      const embed = new EmbedBuilder()
        .setTitle("Message Edited")
        .setDescription(
          `**User:** ${author?.tag ?? "Unknown"}\n` +
          `**User ID:** ${author?.id ?? "unknown"}\n` +
          `**Channel:** <#${channelId}>`
        )
        .setTimestamp(new Date())
        .addFields(
          { name: "Before", value: clip(before || "*empty*"), inline: false },
          { name: "After", value: clip(after || "*empty*"), inline: false }
        );

      const avatar = author?.displayAvatarURL?.({ size: 128 });
      if (avatar) embed.setThumbnail(avatar);

      if (newMessage.url) embed.addFields({ name: "Jump", value: newMessage.url, inline: false });

      await sendToGuildLog(client, guildId, { embeds: [embed] });
    } catch (err) {
      console.error("❌ messageUpdate embed log error:", err);
    }
  },
};
