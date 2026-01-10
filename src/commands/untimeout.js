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
const { addUntimeout } = require("../handlers/infractions");

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
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this command in a server.");
      }

      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      if (!interaction.member.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return replyEphemeral(interaction, "You need **Moderate Members** to use this command.");
      }

      const me = interaction.guild.members.me;
      if (!me?.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return replyEphemeral(interaction, "I need **Moderate Members** to remove timeouts.");
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
        return interaction.editReply("I can’t untimeout that member (hierarchy / permissions).");
      }

      try {
        await targetMember.timeout(null, reasonRaw);
      } catch (err) {
        console.error("❌ untimeout apply error:", err);
        return interaction.editReply("Untimeout failed. Check permissions/role position.");
      }

      // ✅ record in unified infractions history
      const entry = addUntimeout(interaction.guildId, targetUser.id, interaction.user.id, reasonRaw);

      let dmStatus = "✅ DM sent to user.";
      try {
        const dmEmbed = baseEmbed("✅ Timeout Removed")
          .setThumbnail(interaction.guild.iconURL({ size: 128 }))
          .setDescription(`Your timeout in **${escapeMarkdown(interaction.guild.name)}** has been removed.`)
          .addFields(
            { name: "Removed By", value: `${interaction.user.tag}`, inline: true },
            { name: "Reason", value: clip(reasonRaw, 1024), inline: false }
          );

        await targetUser.send({ embeds: [dmEmbed] });
      } catch {
        dmStatus = "⚠️ Could not DM user (DMs closed or blocked).";
      }

      await interaction.editReply(
        `✅ Removed timeout from **${targetUser.tag}**\n` +
          `**Case ID:** \`${entry.id}\`\n` +
          `**Reason:** ${clip(reasonRaw, 1000)}\n\n` +
          `${dmStatus}`
      );

      const embed = baseEmbed("Timeout Removed")
        .setThumbnail(interaction.guild.iconURL({ size: 128 }))
        .setDescription(
          `**User:** ${targetUser.tag} (ID: ${targetUser.id})\n` +
            `**Case ID:** ${entry.id}`
        )
        .addFields(
          { name: "Reason", value: clip(reasonRaw, 1024) },
          { name: "User DM", value: dmStatus, inline: true }
        );

      setActor(embed, interaction.user);
      await sendToGuildLog(client, interaction.guildId, { embeds: [embed] });
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
