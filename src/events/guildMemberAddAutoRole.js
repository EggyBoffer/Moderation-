const { Events } = require("discord.js");
const { maybeApplyJoinRole } = require("../handlers/autoRoles");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(client, member) {
    try {
      // Immediate assignment if due (delay==0),
      // otherwise scheduler catch-up will handle it when due.
      await maybeApplyJoinRole(client, member);
    } catch (err) {
      console.error("❌ GuildMemberAdd auto-role error:", err);
    }
  },
};
