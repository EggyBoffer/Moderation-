const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { setGuildConfig } = require("../storage/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set the channel where moderation logs will be posted in this server.")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("The channel to send logs to")
        .setRequired(true)
    )
    // Only allow members with Manage Guild to use it
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }

    const channel = interaction.options.getChannel("channel", true);

    // Basic safety: ensure it's a text channel you can send to
    if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
      return interaction.reply({ content: "Pick a text channel in this server.", ephemeral: true });
    }

    const updated = setGuildConfig(interaction.guildId, { logChannelId: channel.id });

    await interaction.reply({
      content: `✅ Log channel set to ${channel} for this server.`,
      ephemeral: true,
    });
  },
};
