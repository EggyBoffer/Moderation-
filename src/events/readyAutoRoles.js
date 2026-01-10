const { Events } = require("discord.js");
const { startAutoRoleScheduler } = require("../handlers/autoRoles");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      // Hourly tenure checks, join catch-up every 30 mins
      startAutoRoleScheduler(client, {
        tenureEveryMs: 60 * 60 * 1000,
        joinCatchupEveryMs: 30 * 60 * 1000,
      });
    } catch (err) {
      console.error("❌ Auto-role scheduler start error:", err);
    }
  },
};
