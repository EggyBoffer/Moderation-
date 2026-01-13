const { Events } = require("discord.js");
const { handleAutoResponse } = require("../handlers/autoResponder");

module.exports = {
  name: Events.MessageCreate,
  async execute(client, message) {
    try {
      
      
      await handleAutoResponse(message);
    } catch (err) {
      console.error("❌ messageCreate handler error:", err);
    }
  },
};
