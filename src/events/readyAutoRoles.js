const { Events } = require("discord.js");
const { startAutoRoleScheduler } = require("../handlers/autoRoles");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      // Tenure rules: hourly is fine.
      // Join catch-up: make it fast so short delays work even without timers / after restarts.
      startAutoRoleScheduler(client, {
        tenureEveryMs: 60 * 60 * 1000,      // 1 hour
        joinCatchupEveryMs: 30 * 1000,      // 30 seconds
      });
    } catch (err) {
      console.error("❌ Auto-role scheduler start error:", err);
    }
  },
};
