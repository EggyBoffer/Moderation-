const { Events, EmbedBuilder } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(client, member) {
    const embed = new EmbedBuilder()
      .setTitle("Member Joined")
      .setDescription(`**User:** ${member.user.tag}\n**ID:** ${member.id}`)
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .setTimestamp(new Date());

    await sendToGuildLog(client, member.guild.id, { embeds: [embed] });
  },
};
