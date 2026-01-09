const { Events } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");

module.exports = {
  name: Events.MessageUpdate,
  async execute(client, oldMessage, newMessage) {
    try {
      // Ignore DMs
      if (!newMessage.guild) return;

      // Ignore bots
      if (newMessage.author?.bot) return;

      // Try to fetch partials
      if (oldMessage.partial) {
        try { oldMessage = await oldMessage.fetch(); } catch {}
      }
      if (newMessage.partial) {
        try { newMessage = await newMessage.fetch(); } catch {}
      }

      const before = (oldMessage.content ?? "").trim();
      const after = (newMessage.content ?? "").trim();

      // Ignore non-content edits
      if (before === after) return;

      const clip = (s) => (s.length > 500 ? s.slice(0, 500) + "…" : s);

      await sendToGuildLog(client, newMessage.guild.id, {
        content:
          `🗑️ **Message deleted** by **${authorTag}** (ID: ${authorId}) in <#${channelId}>\n` +
          `**Content:** ${clip(content) || "*no text content*"}`
      });
    } catch (err) {
      console.error("❌ messageUpdate error:", err);
    }
  },
};
