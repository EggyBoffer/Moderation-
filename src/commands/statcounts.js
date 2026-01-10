const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");
const { updateCountsForGuild } = require("../handlers/updateCounts");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("statcounts")
    .setDescription("Member/user/bot count channels")
    .addSubcommand((sc) =>
      sc
        .setName("setup")
        .setDescription("Create/update count channels in a category")
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("Category to place the count channels in")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("members_label")
            .setDescription('Label for total members (default "👥 Members:")')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("users_label")
            .setDescription('Label for users/humans (default "🧍 Users:")')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("bots_label")
            .setDescription('Label for bots (default "🤖 Bots:")')
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("refresh").setDescription("Force refresh the count channels now")
    )
    .addSubcommand((sc) =>
      sc.setName("disable").setDescription("Disable count channels (does not delete them)")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "Use this in a server.");
      }

      const member = interaction.member;
      if (!member.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        return replyEphemeral(
          interaction,
          "You need **Manage Server** to configure stat counts."
        );
      }

      const sub = interaction.options.getSubcommand(true);

      if (sub === "setup") {
        const category = interaction.options.getChannel("category", true);
        const membersLabel = interaction.options.getString("members_label");
        const usersLabel = interaction.options.getString("users_label");
        const botsLabel = interaction.options.getString("bots_label");

        setGuildConfig(interaction.guildId, {
          countsCategoryId: category.id,
          ...(membersLabel ? { countsMembersLabel: membersLabel } : {}),
          ...(usersLabel ? { countsHumansLabel: usersLabel } : {}),
          ...(botsLabel ? { countsBotsLabel: botsLabel } : {}),
        });

        await deferEphemeral(interaction);
        await updateCountsForGuild(interaction.guild, { force: true });

        return interaction.editReply(
          `✅ Stat count channels configured under **${category.name}**.\n` +
            `Use \`/statcounts refresh\` if you ever need to resync.`
        );
      }

      if (sub === "refresh") {
        const cfg = getGuildConfig(interaction.guildId);
        if (!cfg.countsCategoryId) {
          return replyEphemeral(
            interaction,
            "Stat counts aren’t set up yet. Use `/statcounts setup` first."
          );
        }

        await deferEphemeral(interaction);
        await updateCountsForGuild(interaction.guild, { force: true });
        return interaction.editReply("✅ Stat counts refreshed.");
      }

      if (sub === "disable") {
        setGuildConfig(interaction.guildId, { countsCategoryId: null });
        return replyEphemeral(
          interaction,
          "✅ Stat counts disabled. (Existing channels were not deleted.)"
        );
      }
    } catch (err) {
      console.error("❌ statcounts command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running statcounts.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running statcounts.");
      }
    }
  },
};
