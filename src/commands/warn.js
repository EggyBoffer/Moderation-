const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { sendToGuildLog } = require("../handlers/logChannel");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { clip } = require("../handlers/text");
const { isMod } = require("../handlers/permissions");
const { addWarn, listWarns, removeInfractionById } = require("../handlers/infractions");

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
          opt
            .setName("id")
            .setDescription("Warning ID (e.g. INF-...)")
            .setRequired(true)
        )
    )
    // keeps it out of regular users' faces; we still enforce isMod below
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this command in a server.");
      }

      const member = interaction.member;
      if (!isMod(member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const sub = interaction.options.getSubcommand(true);

      if (sub === "add") {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);

        await deferEphemeral(interaction);

        const entry = addWarn(interaction.guildId, user.id, interaction.user.id, reason);

        await interaction.editReply(
          `⚠️ Warned **${user.tag}**\n**ID:** \`${entry.id}\`\n**Reason:** ${clip(entry.reason, 1000)}`
        );

        // Log to moderation log channel
        const embed = baseEmbed("Warning Issued")
          .setDescription(
            `**User:** ${user.tag} (ID: ${user.id})\n` +
              `**Warning ID:** ${entry.id}`
          )
          .addFields({ name: "Reason", value: clip(entry.reason, 1024) });

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

        // newest first, cap output a bit
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
        if (!removed) {
          return interaction.editReply(`Couldn’t find a warning with ID \`${id}\`.`);
        }

        await interaction.editReply(
          `🧹 Removed warning \`${id}\` for <@${removed.userId}>.`
        );

        const embed = baseEmbed("Warning Removed")
          .setDescription(
            `**User:** <@${removed.userId}> (ID: ${removed.userId})\n` +
              `**Warning ID:** ${id}`
          );
        setActor(embed, interaction.user);

        await sendToGuildLog(client, interaction.guildId, { embeds: [embed] });
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
