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
const { parseDurationToMs } = require("../handlers/parseDuration");

function toDiscordTimestamp(ms) {
  return `<t:${Math.floor(ms / 1000)}:f>`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member for a duration")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to timeout").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("duration")
        .setDescription("e.g. 10m, 2h, 1h30m, 3d (max 28d)")
        .setRequired(true)
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
        return replyEphemeral(interaction, "I need **Moderate Members** permission to timeout users.");
      }

      const targetUser = interaction.options.getUser("user", true);
      const durationStr = interaction.options.getString("duration", true);
      const reasonRaw = interaction.options.getString("reason") || "No reason provided";

      const parsed = parseDurationToMs(durationStr);
      if (!parsed.ok) {
        return replyEphemeral(interaction, parsed.error);
      }

      await deferEphemeral(interaction);

      let targetMember;
      try {
        targetMember = await interaction.guild.members.fetch(targetUser.id);
      } catch {
        return interaction.editReply("I can’t find that user in this server.");
      }

      // Discord.js: "moderatable" checks role hierarchy + permissions for moderation actions
      if (!targetMember.moderatable) {
        return interaction.editReply("I can’t timeout that member (role hierarchy / permissions).");
      }

      // Apply timeout
      try {
        await targetMember.timeout(parsed.ms, reasonRaw);
      } catch (err) {
        console.error("❌ timeout command error (apply):", err);
        return interaction.editReply("Timeout failed. Check my permissions and role position.");
      }

      const liftAt = Date.now() + parsed.ms;
      const liftStamp = toDiscordTimestamp(liftAt);

      // DM the user (failure is OK)
      let dmStatus = "✅ DM sent to user.";
      try {
        const dmEmbed = baseEmbed("⏳ You Have Been Timed Out")
          .setThumbnail(interaction.guild.iconURL({ size: 128 }))
          .setDescription(
            `You have been timed out in **${escapeMarkdown(interaction.guild.name)}**.`
          )
          .addFields(
            { name: "Reason", value: clip(reasonRaw, 1024) },
            { name: "Timed Out By", value: `${interaction.user.tag}`, inline: true },
            { name: "Duration", value: `${durationStr}`, inline: true },
            { name: "Timeout Lifts", value: `${liftStamp}`, inline: false }
          )
          .setFooter({
            text: "If you believe this is a mistake, contact the server staff.",
          });

        await targetUser.send({ embeds: [dmEmbed] });
      } catch {
        dmStatus = "⚠️ Could not DM user (DMs closed or blocked).";
      }

      // Reply to moderator
      await interaction.editReply(
        `⏳ Timed out **${targetUser.tag}** for **${durationStr}**\n` +
          `**Timeout lifts:** ${liftStamp}\n` +
          `**Reason:** ${clip(reasonRaw, 1000)}\n\n` +
          `${dmStatus}`
      );

      // Log to moderation log channel
      const embed = baseEmbed("Timeout Applied")
        .setThumbnail(interaction.guild.iconURL({ size: 128 }))
        .setDescription(
          `**User:** ${targetUser.tag} (ID: ${targetUser.id})\n` +
            `**Duration:** ${durationStr}\n` +
            `**Timeout lifts:** ${liftStamp}`
        )
        .addFields(
          { name: "Reason", value: clip(reasonRaw, 1024) },
          { name: "User DM", value: dmStatus, inline: true }
        );

      setActor(embed, interaction.user);
      await sendToGuildLog(client, interaction.guildId, { embeds: [embed] });
      return;
    } catch (err) {
      console.error("❌ timeout command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running timeout.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running timeout.");
      }
    }
  },
};
