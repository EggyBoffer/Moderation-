const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  escapeMarkdown,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { sendToGuildLog } = require("../handlers/logChannel");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { clip } = require("../handlers/text");
const { isMod } = require("../handlers/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a timeout from a member")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to untimeout").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason").setRequired(false)
    )
    // keeps it out of regular users' faces; we still enforce isMod below
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this command in a server.");
      }

      const member = interaction.member;
      if (!isMod(member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      // Extra safety: ensure invoker has ModerateMembers
      if (!member.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return replyEphemeral(interaction, "You need **Moderate Members** permission to use this command.");
      }

      // Ensure bot has ModerateMembers
      const me = interaction.guild.members.me;
      if (!me?.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return replyEphemeral(interaction, "I need **Moderate Members** permission to remove timeouts.");
      }

      const targetUser = interaction.options.getUser("user", true);
      const reasonRaw = interaction.options.getString("reason") || "No reason provided";

      await deferEphemeral(interaction);

      let targetMember;
      try {
        targetMember = await interaction.guild.members.fetch(targetUser.id);
      } catch {
        return interaction.editReply("I can’t find that user in this server.");
      }

      if (!targetMember.moderatable) {
        return interaction.editReply("I can’t untimeout that member (role hierarchy / permissions).");
      }

      // Remove timeout
      try {
        await targetMember.timeout(null, reasonRaw);
      } catch (err) {
        console.error("❌ untimeout command error (apply):", err);
        return interaction.editReply("Untimeout failed. Check my permissions and role position.");
      }

      // DM the user (failure is OK)
      let dmStatus = "✅ DM sent to user.";
      try {
        const dmEmbed = baseEmbed("✅ Timeout Removed")
          .setThumbnail(interaction.guild.iconURL({ size: 128 }))
          .setDescription(
            `Your timeout in **${escapeMarkdown(interaction.guild.name)}** has been removed.`
          )
          .addFields(
            { name: "Removed By", value: `${interaction.user.tag}`, inline: true },
            { name: "Reason", value: clip(reasonRaw, 1024), inline: false }
          )
          .setFooter({
            text: "If you have questions, contact the server staff.",
          });

        await targetUser.send({ embeds: [dmEmbed] });
      } catch {
        dmStatus = "⚠️ Could not DM user (DMs closed or blocked).";
      }

      // Reply to moderator
      await interaction.editReply(
        `✅ Removed timeout from **${targetUser.tag}**\n` +
          `**Reason:** ${clip(reasonRaw, 1000)}\n\n` +
          `${dmStatus}`
      );

      // Log to moderation log channel
      const embed = baseEmbed("Timeout Removed")
        .setThumbnail(interaction.guild.iconURL({ size: 128 }))
        .setDescription(
          `**User:** ${targetUser.tag} (ID: ${targetUser.id})`
        )
        .addFields(
          { name: "Reason", value: clip(reasonRaw, 1024) },
          { name: "User DM", value: dmStatus, inline: true }
        );

      setActor(embed, interaction.user);
      await sendToGuildLog(client, interaction.guildId, { embeds: [embed] });
      return;
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
