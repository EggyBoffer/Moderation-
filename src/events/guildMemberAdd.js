const { Events } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(client, member) {
    await sendToGuildLog(client, member.guild.id, {
      content: `✅ **Member joined:** ${member.user.tag} (<@${member.id}>)`,
    });
  },
};
