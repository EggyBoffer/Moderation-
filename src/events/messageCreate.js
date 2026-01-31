const { Events } = require("discord.js");
const { handleAutoResponse } = require("../handlers/autoResponder");
const { handleWatchMessage } = require("../handlers/watchSystem");

module.exports = {
  name: Events.MessageCreate,
  async execute(client, message) {
    try {
      await handleWatchMessage(client, message);
      await handleAutoResponse(message);
    } catch (err) {
      console.error("❌ messageCreate handler error:", err);
    }
  },
};
