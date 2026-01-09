const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("viewconfig")
    .setDescription("View this server's bot configuration (admin only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }

    const cfg = getGuildConfig(interaction.guildId);

    await interaction.reply({
      content:
        `**Server config:**\n` +
        `• logChannelId: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "*not set*"}`,
      ephemeral: true,
    });
  },
};
