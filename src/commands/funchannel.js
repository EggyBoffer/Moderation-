const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("funchannel")
    .setDescription("Configure where fun commands can be used.")
    .addSubcommand((sc) =>
      sc
        .setName("set")
        .setDescription("Set the channel where fun commands are allowed.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to allow fun commands in")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("clear").setDescription("Allow fun commands in any channel (removes restriction).")
    )
    .addSubcommand((sc) =>
      sc.setName("view").setDescription("View the current fun command channel restriction.")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");

      const member = interaction.member;
      if (!member.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        return replyEphemeral(interaction, "You need **Manage Server** to configure the fun channel.");
      }

      const sub = interaction.options.getSubcommand(true);

      if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);

        await deferEphemeral(interaction);
        setGuildConfig(interaction.guildId, { funChannelId: channel.id });

        return interaction.editReply(`✅ Fun commands are now restricted to ${channel}.`);
      }

      if (sub === "clear") {
        await deferEphemeral(interaction);
        setGuildConfig(interaction.guildId, { funChannelId: null });

        return interaction.editReply("✅ Fun commands can now be used in **any** channel.");
      }

      if (sub === "view") {
        const cfg = getGuildConfig(interaction.guildId);
        const chId = cfg.funChannelId;

        if (!chId) return replyEphemeral(interaction, "🎉 Fun commands are allowed in **any** channel.");

        return replyEphemeral(interaction, `🎉 Fun commands are restricted to <#${chId}>.`);
      }
    } catch (err) {
      console.error("❌ Error running /funchannel:", err);
      return replyEphemeral(interaction, "Something went wrong running /funchannel.");
    }
  },
};
