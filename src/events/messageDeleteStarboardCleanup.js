const { Events } = require("discord.js");
const { cleanupOnMessageDelete } = require("../handlers/starboard");

module.exports = {
  name: Events.MessageDelete,
  async execute(client, message) {
    try {
      if (!message?.guild) return;
      await cleanupOnMessageDelete(message.guild, message.id);
    } catch (err) {
      console.error("❌ starboard message delete cleanup error:", err);
    }
  },
};
