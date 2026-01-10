const { Events } = require("discord.js");
const { handleStarReaction } = require("../handlers/starboard");

module.exports = {
  name: Events.MessageReactionRemove,
  async execute(client, reaction, user) {
    try {
      await handleStarReaction(client, reaction);
    } catch (err) {
      console.error("❌ starboard reaction remove error:", err);
    }
  },
};
