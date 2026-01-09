const { Events } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(client, member) {
    const tag = member.user?.tag ?? `UnknownUser(${member.id})`;

    await sendToGuildLog(client, member.guild.id, {
      content: `🚪 **Member left:** ${tag} (<@${member.id}>)`,
    });
  },
};
