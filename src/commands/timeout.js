const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { parseDurationToMs } = require("../handlers/parseDuration");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member for a duration")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Member to timeout").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("duration")
        .setDescription("e.g. 10m, 2h, 3d, 1h30m")
        .setRequired(true)
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

      // 1) Server policy mod gate
      if (!isMod(member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      // 2) Permission check (user)
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return replyEphemeral(interaction, "You need **Moderate Members** to use /timeout.");
      }

      // 3) Permission check (bot)
      if (!botMember?.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return replyEphemeral(interaction, "I need **Moderate Members** permission to timeout members.");
      }

      const targetUser = interaction.options.getUser("user", true);
      const durationRaw = interaction.options.getString("duration", true);
      const reason = (interaction.options.getString("reason", false) ?? "").trim();

      const parsed = parseDurationToMs(durationRaw);
      if (!parsed.ok) {
        return replyEphemeral(interaction, parsed.error);
      }

      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) {
        return replyEphemeral(interaction, "I can’t find that member in this server.");
      }

      // Discord.js convenience: prevents timing out admins / higher roles / if bot lacks ability
      if (!target.moderatable) {
        return replyEphemeral(interaction, "I can’t timeout that member (role hierarchy / permissions)." );
      }

      await deferEphemeral(interaction);

      await target.timeout(parsed.ms, reason || undefined);

      // moderationLogs.js will log the timeout via audit logs, including reason
      const until = Date.now() + parsed.ms;
      const untilTs = `<t:${Math.floor(until / 1000)}:F>`;

      await interaction.editReply(
        `✅ Timed out **${targetUser.tag}** until ${untilTs}.` +
          (reason ? `\nReason: ${reason}` : "")
      );
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
