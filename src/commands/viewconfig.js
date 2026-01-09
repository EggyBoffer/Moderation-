const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("viewconfig")
    .setDescription("View this server's bot configuration (admin only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyEphemeral( 
        interaction, "This command can only be used in a server." 
      );
    }

    const cfg = getGuildConfig(interaction.guildId);

    await replyEphemeral(
      interaction,
        `**Server config:**\n` +
        `• logChannelId: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "*not set*"}`);
  },
};
