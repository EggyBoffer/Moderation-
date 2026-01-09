const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a timeout from a member")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Member to untimeout").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason (logged)").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this command in a server.");
      }

      const member = interaction.member;
      const botMember = interaction.guild.members.me;

      if (!isMod(member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return replyEphemeral(interaction, "You need **Moderate Members** to use /untimeout.");
      }

      if (!botMember?.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return replyEphemeral(interaction, "I need **Moderate Members** permission to untimeout members.");
      }

      const targetUser = interaction.options.getUser("user", true);
      const reason = (interaction.options.getString("reason", false) ?? "").trim();

      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) {
        return replyEphemeral(interaction, "I can’t find that member in this server.");
      }

      if (!target.moderatable) {
        return replyEphemeral(interaction, "I can’t untimeout that member (role hierarchy / permissions).");
      }

      await deferEphemeral(interaction);

      await target.timeout(null, reason || undefined);

      await interaction.editReply(
        `✅ Removed timeout from **${targetUser.tag}**.` + (reason ? `\nReason: ${reason}` : "")
      );

      // moderationLogs.js will log the removal
    } catch (err) {
      console.error("❌ untimeout command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running untimeout.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running untimeout.");
      }
    }
  },
};
