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
          `✏️ **Message edited** by ${newMessage.author.tag} (<@${newMessage.author.id}>) in <#${newMessage.channel.id}>\n` +
          `**Before:** ${clip(before) || "*empty*"}\n` +
          `**After:** ${clip(after) || "*empty*"}\n` +
          (newMessage.url ? `🔗 ${newMessage.url}` : ""),
      });
    } catch (err) {
      console.error("❌ messageUpdate error:", err);
    }
  },
};
