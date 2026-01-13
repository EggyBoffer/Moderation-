const { SlashCommandBuilder, PermissionFlagsBits, escapeMarkdown } = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { sendToGuildLog } = require("../handlers/logChannel");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { clip } = require("../handlers/text");
const { isMod } = require("../handlers/permissions");
const { addWarn, listWarns, removeInfractionById } = require("../handlers/infractions");
const { maybeEscalateOnWarn } = require("../handlers/escalation");

function formatWarnLine(w) {
  const when = w.ts ? `<t:${Math.floor(w.ts / 1000)}:f>` : "(unknown time)";
  return `• \`${w.id}\` — ${when} — <@${w.modId}>\n  ↳ ${w.reason}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn system")
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Warn a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to warn").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("reason").setDescription("Reason").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("list")
        .setDescription("List warnings for a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to view").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove a warning by ID")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Warning ID (e.g. INF-...)").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this command in a server.");
      }

      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const sub = interaction.options.getSubcommand(true);

      if (sub === "add") {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);

        await deferEphemeral(interaction);

        
        const entry = addWarn(interaction.guildId, user.id, interaction.user.id, reason);

        
        let dmStatus = "✅ DM sent to user.";
        try {
          const dmEmbed = baseEmbed("⚠️ You Have Been Warned")
            .setThumbnail(interaction.guild.iconURL({ size: 128 }))
            .setDescription(
              `You have received a warning in **${escapeMarkdown(interaction.guild.name)}**.`
            )
            .addFields(
              { name: "Reason", value: clip(entry.reason, 1024) },
              { name: "Warned By", value: `${interaction.user.tag}`, inline: true },
              { name: "Warning ID", value: `\`${entry.id}\``, inline: true }
            )
            .setFooter({
              text: "Please review the server rules. Repeated warnings may lead to further moderation action.",
            });

          await user.send({ embeds: [dmEmbed] });
        } catch {
          dmStatus = "⚠️ Could not DM user (DMs closed or blocked).";
        }

        
        let escalationLine = "";
        try {
          const guild = interaction.guild;
          const targetMember = await guild.members.fetch(user.id);

          const esc = await maybeEscalateOnWarn({
            guild,
            client,
            targetMember,
            modUser: interaction.user,
          });

          if (esc.escalated) {
            escalationLine =
              `\n\n🚨 **Auto escalation triggered** (reached **${esc.rule.warns}** warns): ` +
              `Timed out for **${esc.rule.durationStr}** (lifts ${esc.liftStamp})\n` +
              `**Escalation Case ID:** \`${esc.caseId}\`` +
              (esc.clearedWarns ? `\nWarns reset: **${esc.clearedWarns}** removed.` : "");
          }
        } catch (e) {
          console.error("❌ escalation on warn failed:", e);
          
        }

        await interaction.editReply(
          `⚠️ Warned **${user.tag}**\n` +
            `**ID:** \`${entry.id}\`\n` +
            `**Reason:** ${clip(entry.reason, 1000)}\n\n` +
            `${dmStatus}` +
            `${escalationLine}`
        );

        
        const embed = baseEmbed("Warning Issued")
          .setThumbnail(interaction.guild.iconURL({ size: 128 }))
          .setDescription(
            `**User:** ${user.tag} (ID: ${user.id})\n` +
              `**Warning ID:** ${entry.id}`
          )
          .addFields(
            { name: "Reason", value: clip(entry.reason, 1024) },
            { name: "User DM", value: dmStatus, inline: true }
          );

        if (escalationLine) {
          embed.addFields({
            name: "Auto Escalation",
            value: clip(escalationLine.replace(/^\n+/, ""), 1024),
          });
        }

        setActor(embed, interaction.user);
        await sendToGuildLog(client, interaction.guildId, { embeds: [embed] });
        return;
      }

      if (sub === "list") {
        const user = interaction.options.getUser("user", true);
        const warns = listWarns(interaction.guildId, user.id);

        if (!warns.length) {
          return replyEphemeral(interaction, `✅ **${user.tag}** has no warnings.`);
        }

        const sorted = warns.slice().sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
        const show = sorted.slice(0, 10);
        const lines = show.map(formatWarnLine).join("\n");

        return replyEphemeral(
          interaction,
          `⚠️ Warnings for **${user.tag}** (showing ${show.length}/${warns.length})\n\n${lines}`
        );
      }

      if (sub === "remove") {
        const id = interaction.options.getString("id", true).trim();

        await deferEphemeral(interaction);

        const removed = removeInfractionById(interaction.guildId, id);
        if (!removed || removed.type !== "warn") {
          return interaction.editReply(`Couldn’t find a warning with ID \`${id}\`.`);
        }

        await interaction.editReply(`🧹 Removed warning \`${id}\` for <@${removed.userId}>.`);
        return;
      }
    } catch (err) {
      console.error("❌ warn command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running warn.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running warn.");
      }
    }
  },
};
