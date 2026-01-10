const { Events } = require("discord.js");
const { handleAutoResponse } = require("../handlers/autoResponder");

module.exports = {
  name: Events.MessageCreate,
  async execute(client, message) {
    try {
      // Auto responder (keyword/phrase -> send message in channel)
      // Does not reply to the message; posts a normal message.
      await handleAutoResponse(message);
    } catch (err) {
      console.error("❌ messageCreate handler error:", err);
    }
  },
};
