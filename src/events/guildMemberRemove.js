const { Events, EmbedBuilder } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");
const { updateCountsForGuild } = require("../handlers/updateCounts");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(client, member) {
    const embed = new EmbedBuilder()
      .setTitle("Member Left")
      .setDescription(`**User:** ${member.user.tag}\n**ID:** ${member.id}`)
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .setAuthor({
        name: member.guild.name,
        iconURL: member.guild.iconURL({ size: 128 }) || undefined,
      })
      .setTimestamp(new Date());

    await sendToGuildLog(client, member.guild.id, { embeds: [embed] });

    // Update member/user/bot count channels (if configured)
    updateCountsForGuild(member.guild).catch(() => null);
  },
};
